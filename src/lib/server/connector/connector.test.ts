import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createTestConnector, ORIGIN, toolJson } from './testing/harness.js';

const mcpInit = {
	method: 'POST',
	headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
	body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' })
};

describe('/mcp without credentials', () => {
	it('answers 401 and points at the protected-resource metadata', async () => {
		const t = createTestConnector();

		const res = await t.fetch(`${ORIGIN}/mcp`, mcpInit);

		expect(res.status).toBe(401);
		expect(res.headers.get('www-authenticate')).toContain(
			`resource_metadata="${ORIGIN}/.well-known/oauth-protected-resource/mcp"`
		);
	});

	it('answers 401 for a made-up token', async () => {
		const t = createTestConnector();
		const res = await t.fetch(`${ORIGIN}/mcp`, {
			...mcpInit,
			headers: { ...mcpInit.headers, authorization: 'Bearer nope' }
		});
		expect(res.status).toBe(401);
	});
});

describe('OAuth metadata', () => {
	it('protected-resource metadata names this server as its own authorization server', async () => {
		const t = createTestConnector();
		for (const path of ['/.well-known/oauth-protected-resource', '/.well-known/oauth-protected-resource/mcp']) {
			const meta = await (await t.fetch(`${ORIGIN}${path}`)).json();
			expect(meta).toMatchObject({ resource: `${ORIGIN}/mcp`, authorization_servers: [ORIGIN] });
		}
	});

	it('authorization-server metadata advertises DCR, PKCE S256 and refresh tokens', async () => {
		const t = createTestConnector();
		const meta = await (await t.fetch(`${ORIGIN}/.well-known/oauth-authorization-server`)).json();
		expect(meta).toMatchObject({
			issuer: ORIGIN,
			authorization_endpoint: `${ORIGIN}/oauth/authorize`,
			token_endpoint: `${ORIGIN}/oauth/token`,
			registration_endpoint: `${ORIGIN}/oauth/register`,
			code_challenge_methods_supported: ['S256'],
			token_endpoint_auth_methods_supported: ['none']
		});
		expect(meta.grant_types_supported).toEqual(['authorization_code', 'refresh_token']);
	});
});

describe('dynamic client registration', () => {
	const register = (t: ReturnType<typeof createTestConnector>, body: unknown) =>
		t.fetch(`${ORIGIN}/oauth/register`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(body)
		});

	it('accepts loopback http and https redirect URIs (Claude Code, claude.ai)', async () => {
		const t = createTestConnector();
		for (const uri of ['http://localhost:1234/callback', 'http://127.0.0.1:1/cb', 'https://claude.ai/api/mcp/auth_callback']) {
			const res = await register(t, { redirect_uris: [uri], client_name: 'c' });
			expect(res.status).toBe(201);
			expect(await res.json()).toMatchObject({ redirect_uris: [uri], token_endpoint_auth_method: 'none' });
		}
	});

	it('rejects plain-http non-loopback and missing redirect URIs', async () => {
		const t = createTestConnector();
		expect((await register(t, { redirect_uris: ['http://evil.example/cb'] })).status).toBe(400);
		expect((await register(t, {})).status).toBe(400);
	});
});

describe('authorize step', () => {
	async function authorizeUrl(t: ReturnType<typeof createTestConnector>) {
		const clientId = await t.registerClient('http://localhost:33418/callback');
		const url = new URL(`${ORIGIN}/oauth/authorize`);
		url.search = new URLSearchParams({
			response_type: 'code',
			client_id: clientId,
			redirect_uri: 'http://localhost:33418/callback',
			code_challenge: createHash('sha256').update('v'.repeat(43)).digest('base64url'),
			code_challenge_method: 'S256',
			state: 's',
			resource: `${ORIGIN}/mcp`
		}).toString();
		return url;
	}

	it('sends a visitor without an owner session to the login, then back here', async () => {
		const t = createTestConnector();
		const url = await authorizeUrl(t);

		const res = await t.fetch(url);

		expect(res.status).toBe(302);
		const login = new URL(res.headers.get('location')!, ORIGIN);
		expect(login.pathname).toBe('/auth/login');
		expect(login.searchParams.get('next')).toBe(url.pathname + url.search);
	});

	it('shows a consent page to the owner naming the client', async () => {
		const t = createTestConnector();
		const url = await authorizeUrl(t);

		const res = await t.fetch(url, { headers: { cookie: await t.ownerCookie() } });

		expect(res.status).toBe(200);
		expect(await res.text()).toContain('Claude Code');
	});

	it('refuses an unregistered redirect URI without redirecting to it', async () => {
		const t = createTestConnector();
		const url = await authorizeUrl(t);
		url.searchParams.set('redirect_uri', 'http://localhost:33418/other');

		const res = await t.fetch(url, { headers: { cookie: await t.ownerCookie() } });

		expect(res.status).toBe(400);
		expect(res.headers.get('location')).toBeNull();
	});

	it('requires PKCE S256', async () => {
		const t = createTestConnector();
		const url = await authorizeUrl(t);
		url.searchParams.set('code_challenge_method', 'plain');

		const res = await t.fetch(url, { headers: { cookie: await t.ownerCookie() } });

		expect(new URL(res.headers.get('location')!).searchParams.get('error')).toBe('invalid_request');
	});

	it('does not issue a code without an owner session', async () => {
		const t = createTestConnector();
		const url = await authorizeUrl(t);
		const res = await t.fetch(url.toString().replace('?', '?x=1&'), {
			method: 'POST',
			headers: { 'content-type': 'application/x-www-form-urlencoded' },
			body: new URLSearchParams([...url.searchParams, ['decision', 'allow']])
		});
		expect(res.headers.get('location') ?? '').not.toContain('code=');
		expect(res.status).toBeGreaterThanOrEqual(300);
	});
});

describe('token endpoint', () => {
	async function codeFor(t: ReturnType<typeof createTestConnector>, verifier: string) {
		const clientId = await t.registerClient();
		const approve = await t.fetch(`${ORIGIN}/oauth/authorize`, {
			method: 'POST',
			headers: { 'content-type': 'application/x-www-form-urlencoded', cookie: await t.ownerCookie() },
			body: new URLSearchParams({
				response_type: 'code',
				client_id: clientId,
				redirect_uri: 'http://localhost:33418/callback',
				code_challenge: createHash('sha256').update(verifier).digest('base64url'),
				code_challenge_method: 'S256',
				decision: 'allow'
			})
		});
		return { clientId, code: new URL(approve.headers.get('location')!).searchParams.get('code')! };
	}
	const exchange = (t: ReturnType<typeof createTestConnector>, form: Record<string, string>) =>
		t.fetch(`${ORIGIN}/oauth/token`, {
			method: 'POST',
			headers: { 'content-type': 'application/x-www-form-urlencoded' },
			body: new URLSearchParams(form)
		});

	it('rejects a wrong PKCE verifier and a replayed code', async () => {
		const t = createTestConnector();
		const verifier = 'a'.repeat(50);
		const { clientId, code } = await codeFor(t, verifier);
		const base = { grant_type: 'authorization_code', client_id: clientId, redirect_uri: 'http://localhost:33418/callback' };

		const wrong = await exchange(t, { ...base, code, code_verifier: 'b'.repeat(50) });
		expect(wrong.status).toBe(400);
		expect((await wrong.json()).error).toBe('invalid_grant');

		// a failed attempt burns the code
		expect((await exchange(t, { ...base, code, code_verifier: verifier })).status).toBe(400);
	});

	it('expires authorization codes after 60 seconds', async () => {
		const t = createTestConnector();
		const verifier = 'a'.repeat(50);
		const { clientId, code } = await codeFor(t, verifier);
		t.clock.advance(61_000);

		const res = await exchange(t, {
			grant_type: 'authorization_code',
			client_id: clientId,
			redirect_uri: 'http://localhost:33418/callback',
			code,
			code_verifier: verifier
		});
		expect(res.status).toBe(400);
	});

	it('answers invalid_client for an unknown client so Claude re-registers', async () => {
		const t = createTestConnector();
		const res = await exchange(t, { grant_type: 'authorization_code', client_id: 'ghost', code: 'x' });
		expect(res.status).toBe(401);
		expect((await res.json()).error).toBe('invalid_client');
	});

	it('refresh rotates the refresh token; the new access token works, a replayed old one revokes the family', async () => {
		const t = createTestConnector();
		const first = await t.authorizeClient();

		const res = await exchange(t, { grant_type: 'refresh_token', client_id: first.clientId, refresh_token: first.refreshToken });
		expect(res.status).toBe(200);
		const second = await res.json();
		expect(second.refresh_token).not.toBe(first.refreshToken);
		const client = await t.connect(second.access_token);
		expect((await client.listTools()).tools.length).toBeGreaterThan(0);

		const replay = await exchange(t, { grant_type: 'refresh_token', client_id: first.clientId, refresh_token: first.refreshToken });
		expect(replay.status).toBe(400);
		// whole family is dead now, including the newest tokens
		const dead = await t.fetch(`${ORIGIN}/mcp`, {
			...mcpInit,
			headers: { ...mcpInit.headers, authorization: `Bearer ${second.access_token}` }
		});
		expect(dead.status).toBe(401);
	});

	it('access tokens expire after an hour', async () => {
		const t = createTestConnector();
		const { accessToken } = await t.authorizeClient();
		t.clock.advance(3_601_000);
		const res = await t.fetch(`${ORIGIN}/mcp`, {
			...mcpInit,
			headers: { ...mcpInit.headers, authorization: `Bearer ${accessToken}` }
		});
		expect(res.status).toBe(401);
	});
});

describe('Task tools over MCP', () => {
	it('lists the expected tools', async () => {
		const t = createTestConnector();
		const claude = await t.connectClaude();

		const names = (await claude.listTools()).tools.map((x) => x.name).sort();

		expect(names).toEqual(
			expect.arrayContaining(['complete_task', 'create_task', 'list_tasks', 'uncomplete_task'])
		);
	});

	it('a created Task is visible via list_tasks and logged as actor claude', async () => {
		const t = createTestConnector();
		const claude = await t.connectClaude();

		const created = toolJson<{ id: number }>(
			await claude.callTool({ name: 'create_task', arguments: { title: 'Купить молоко' } })
		);
		const listed = toolJson<{ id: number; title: string }[]>(
			await claude.callTool({ name: 'list_tasks', arguments: {} })
		);

		expect(listed).toEqual([expect.objectContaining({ id: created.id, title: 'Купить молоко' })]);
		expect(t.planner.changeLog()).toEqual([
			expect.objectContaining({ actor: 'claude', action: 'task.create', entityId: created.id })
		]);
	});

	it('complete and uncomplete work, and rule violations come back as tool errors', async () => {
		const t = createTestConnector();
		const claude = await t.connectClaude();
		const { id } = toolJson<{ id: number }>(
			await claude.callTool({ name: 'create_task', arguments: { title: 'x' } })
		);

		await claude.callTool({ name: 'complete_task', arguments: { id } });
		expect(t.planner.listTasks()[0].completedAt).not.toBeNull();
		await claude.callTool({ name: 'uncomplete_task', arguments: { id } });
		expect(t.planner.listTasks()[0].completedAt).toBeNull();

		const again = await claude.callTool({ name: 'uncomplete_task', arguments: { id } });
		expect(again.isError).toBe(true);
	});
});
