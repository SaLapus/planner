/**
 * Seam-2 harness: the Claude connector (OAuth server + `/mcp`) running in-process, with a
 * fake IdP for the owner login and the official MCP client as the caller.
 *
 *   const t = createTestConnector();
 *   const claude = await t.connectClaude();             // does the whole OAuth dance
 *   await claude.callTool({ name: 'create_task', arguments: { title: 'x' } });
 *   t.planner.changeLog();                               // assert on the core, via its public interface
 *
 * Build on this for every new tool's contract test; do not hand-roll OAuth in tests.
 */
import { createHash, randomBytes } from 'node:crypto';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { createTestPlanner } from '#lib/core/testing/harness.js';
import { createAuth, type AuthConfig } from '#lib/server/auth/index.js';
import { createFakeIdp } from '#lib/server/auth/testing/fake-idp.js';
import { createConnector } from '../index.js';

export const ORIGIN = 'https://plan.test';
const ISSUER = 'https://id.test';

const authConfig: AuthConfig = {
	issuer: ISSUER,
	clientId: 'planner',
	clientSecret: 'shh',
	allowedSubject: 'owner-sub',
	sessionSecret: 'a-long-random-test-secret-of-32+chars',
	publicUrl: ORIGIN,
	sessionDays: 90
};

export interface Tokens {
	clientId: string;
	accessToken: string;
	refreshToken: string;
}

export function createTestConnector() {
	// The MCP SDK checks token expiry against the real clock, so the fake one must start at the real now.
	const { planner, clock, db } = createTestPlanner({ now: new Date().toISOString() });
	const idp = createFakeIdp(ISSUER);
	const auth = createAuth({ config: authConfig, fetch: idp.fetch, clock });
	const connector = createConnector({
		planner,
		db,
		clock,
		publicUrl: ORIGIN,
		isOwner: auth.isOwner
	});

	/** In-process `fetch` straight into the connector (what the MCP client uses as its network). */
	const fetchImpl = async (input: string | URL | Request, init?: RequestInit) => {
		const response = await connector.handle(new Request(input, init));
		return response ?? new Response('not found', { status: 404 });
	};

	/** Logs in as the owner through the fake IdP; returns the Cookie header value. */
	async function ownerCookie(sub = 'owner-sub'): Promise<string> {
		const asCookie = (res: Response) =>
			res.headers
				.getSetCookie()
				.filter((c) => !/Max-Age=0/i.test(c))
				.map((c) => c.split(';')[0])
				.join('; ');
		const start = await auth.handle(new Request(`${ORIGIN}/`));
		if (start.type !== 'response') throw new Error('expected login redirect');
		const authUrl = new URL(start.response.headers.get('location')!);
		const code = idp.issueCode({
			sub,
			nonce: authUrl.searchParams.get('nonce')!,
			clientId: authUrl.searchParams.get('client_id')!,
			codeChallenge: authUrl.searchParams.get('code_challenge')!
		});
		const done = await auth.handle(
			new Request(`${ORIGIN}/auth/callback?code=${code}&state=${authUrl.searchParams.get('state')}`, {
				headers: { cookie: asCookie(start.response) }
			})
		);
		if (done.type !== 'response') throw new Error('expected callback redirect');
		return asCookie(done.response);
	}

	/** Dynamic client registration; returns the new client_id. */
	async function registerClient(
		redirectUri = 'http://localhost:33418/callback',
		name = 'Claude Code'
	): Promise<string> {
		const res = await fetchImpl(`${ORIGIN}/oauth/register`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				client_name: name,
				redirect_uris: [redirectUri],
				token_endpoint_auth_method: 'none',
				grant_types: ['authorization_code', 'refresh_token'],
				response_types: ['code']
			})
		});
		if (res.status !== 201) throw new Error(`registration failed: ${res.status} ${await res.text()}`);
		return ((await res.json()) as { client_id: string }).client_id;
	}

	/** Registers a client, approves it as the owner, and trades the code for tokens (PKCE S256). */
	async function authorizeClient(redirectUri = 'http://localhost:33418/callback'): Promise<Tokens> {
		const clientId = await registerClient(redirectUri);
		const verifier = randomBytes(32).toString('base64url');
		const params = {
			response_type: 'code',
			client_id: clientId,
			redirect_uri: redirectUri,
			code_challenge: createHash('sha256').update(verifier).digest('base64url'),
			code_challenge_method: 'S256',
			state: 'xyz',
			scope: 'mcp',
			resource: `${ORIGIN}/mcp`
		};
		const approve = await fetchImpl(`${ORIGIN}/oauth/authorize`, {
			method: 'POST',
			headers: { 'content-type': 'application/x-www-form-urlencoded', cookie: await ownerCookie(), origin: ORIGIN },
			body: new URLSearchParams({ ...params, decision: 'allow' })
		});
		const location = new URL(approve.headers.get('location') ?? 'none:');
		const code = location.searchParams.get('code');
		if (!code) throw new Error(`no code issued: ${approve.status} ${location}`);
		const token = await fetchImpl(`${ORIGIN}/oauth/token`, {
			method: 'POST',
			headers: { 'content-type': 'application/x-www-form-urlencoded' },
			body: new URLSearchParams({
				grant_type: 'authorization_code',
				code,
				client_id: clientId,
				redirect_uri: redirectUri,
				code_verifier: verifier,
				resource: `${ORIGIN}/mcp`
			})
		});
		const body = (await token.json()) as { access_token?: string; refresh_token?: string };
		if (!body.access_token || !body.refresh_token) throw new Error(`token failed: ${JSON.stringify(body)}`);
		return { clientId, accessToken: body.access_token, refreshToken: body.refresh_token };
	}

	/** An official MCP client connected to `/mcp` with the given bearer token. */
	async function connect(accessToken: string): Promise<Client> {
		const client = new Client({ name: 'contract-test', version: '1.0.0' });
		await client.connect(
			new StreamableHTTPClientTransport(new URL(`${ORIGIN}/mcp`), {
				requestInit: { headers: { authorization: `Bearer ${accessToken}` } },
				fetch: fetchImpl as typeof fetch
			})
		);
		return client;
	}

	/** Full OAuth dance, then a connected MCP client: "Claude, as the owner authorised it". */
	async function connectClaude(): Promise<Client> {
		return connect((await authorizeClient()).accessToken);
	}

	return {
		planner,
		clock,
		fetch: fetchImpl,
		ownerCookie,
		registerClient,
		authorizeClient,
		connect,
		connectClaude
	};
}

/** Pulls the text of a tool result (all our tools answer with one JSON text block). */
export function toolJson<T = unknown>(result: { content?: unknown }): T {
	const first = (result.content as { type: string; text?: string }[])[0];
	return JSON.parse(first.text ?? 'null') as T;
}
