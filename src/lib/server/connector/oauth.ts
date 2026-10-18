/**
 * The Planner as its own OAuth 2.1 authorization server for `/mcp`:
 * discovery metadata, dynamic client registration (RFC 7591), authorize + consent
 * (needs an owner session), token endpoint (authorization_code + PKCE S256, refresh with
 * rotation and reuse detection).
 *
 * Framework-free: `handle(Request) => Response | undefined`. Tokens are opaque random
 * strings; only their SHA-256 hashes are stored. Tables are created here (IF NOT EXISTS),
 * separate from the core's migrations, in the same SQLite file so backups include them.
 */
import { createHash, randomBytes } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import type { Clock } from '#lib/core/index.js';

const CODE_TTL_MS = 60_000;
const ACCESS_TTL_S = 3600;
const REFRESH_TTL_MS = 180 * 24 * 3600 * 1000;
const MAX_CLIENTS = 500;
const SCOPE = 'mcp';

export interface OAuthDeps {
	db: DatabaseSync;
	clock: Clock;
	/** Public origin, e.g. https://plan.example.com (never derived from the request). */
	publicUrl: string;
	isOwner(request: Request): boolean;
}

export interface VerifiedToken {
	clientId: string;
	scopes: string[];
	/** Seconds since epoch. */
	expiresAt: number;
}

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
const random = () => randomBytes(32).toString('base64url');

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
	Response.json(body, { status, headers: { 'cache-control': 'no-store', ...headers } });
const oauthError = (error: string, description: string, status = 400) =>
	json({ error, error_description: description }, status);

const esc = (s: string) =>
	s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

function isLoopbackHttp(u: URL): boolean {
	return u.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname);
}

/** Registered redirect URIs must be https or http on loopback, without fragments. */
function validRedirectUri(raw: unknown): raw is string {
	if (typeof raw !== 'string') return false;
	try {
		const u = new URL(raw);
		return !u.hash && (u.protocol === 'https:' || isLoopbackHttp(u));
	} catch {
		return false;
	}
}

/** Exact match, except loopback URIs where (RFC 8252) host variant and port may differ. */
function redirectMatches(registered: string[], requested: string): boolean {
	if (registered.includes(requested)) return true;
	let req: URL;
	try {
		req = new URL(requested);
	} catch {
		return false;
	}
	if (!isLoopbackHttp(req)) return false;
	return registered.some((r) => {
		const reg = new URL(r);
		return isLoopbackHttp(reg) && reg.pathname === req.pathname && reg.search === req.search;
	});
}

export function createOAuthServer({ db, clock, publicUrl, isOwner }: OAuthDeps) {
	const origin = new URL(publicUrl).origin;
	const resource = `${origin}/mcp`;
	const nowMs = () => clock.now().getTime();

	db.exec(`
		CREATE TABLE IF NOT EXISTS oauth_client (
			id TEXT PRIMARY KEY, name TEXT NOT NULL, redirect_uris TEXT NOT NULL, created_at TEXT NOT NULL
		);
		CREATE TABLE IF NOT EXISTS oauth_code (
			hash TEXT PRIMARY KEY, client_id TEXT NOT NULL, redirect_uri TEXT NOT NULL,
			challenge TEXT NOT NULL, scope TEXT NOT NULL, expires_at INTEGER NOT NULL
		);
		CREATE TABLE IF NOT EXISTS oauth_token (
			id INTEGER PRIMARY KEY AUTOINCREMENT, family TEXT NOT NULL, client_id TEXT NOT NULL, scope TEXT NOT NULL,
			access_hash TEXT NOT NULL UNIQUE, access_expires_at INTEGER NOT NULL,
			refresh_hash TEXT NOT NULL UNIQUE, refresh_expires_at INTEGER NOT NULL,
			rotated INTEGER NOT NULL DEFAULT 0, revoked INTEGER NOT NULL DEFAULT 0
		);
	`);

	/** The canonical MCP URL, with or without a trailing slash, is the only valid audience. */
	const resourceOk = (value: string | null | undefined) =>
		!value || value.replace(/\/$/, '') === resource;

	function getClient(id: string | null) {
		if (!id) return undefined;
		const row = db.prepare('SELECT * FROM oauth_client WHERE id = ?').get(id) as
			| { id: string; name: string; redirect_uris: string }
			| undefined;
		return row && { id: row.id, name: row.name, redirectUris: JSON.parse(row.redirect_uris) as string[] };
	}

	// ---- metadata -------------------------------------------------------------------------

	const protectedResourceMetadata = () =>
		json({
			resource,
			authorization_servers: [origin],
			scopes_supported: [SCOPE],
			bearer_methods_supported: ['header']
		});

	const authorizationServerMetadata = () =>
		json({
			issuer: origin,
			authorization_endpoint: `${origin}/oauth/authorize`,
			token_endpoint: `${origin}/oauth/token`,
			registration_endpoint: `${origin}/oauth/register`,
			response_types_supported: ['code'],
			grant_types_supported: ['authorization_code', 'refresh_token'],
			code_challenge_methods_supported: ['S256'],
			token_endpoint_auth_methods_supported: ['none'],
			scopes_supported: [SCOPE]
		});

	// ---- dynamic client registration -----------------------------------------------------

	async function register(request: Request): Promise<Response> {
		let body: Record<string, unknown>;
		try {
			body = await request.json();
		} catch {
			return oauthError('invalid_client_metadata', 'Body must be JSON');
		}
		const uris = body.redirect_uris;
		if (!Array.isArray(uris) || uris.length === 0 || uris.length > 10 || !uris.every(validRedirectUri)) {
			return oauthError(
				'invalid_redirect_uri',
				'redirect_uris must be https URLs or http loopback URLs'
			);
		}
		const count = (db.prepare('SELECT COUNT(*) AS n FROM oauth_client').get() as { n: number }).n;
		if (count >= MAX_CLIENTS) return oauthError('temporarily_unavailable', 'Too many clients', 503);

		const name = typeof body.client_name === 'string' ? body.client_name.slice(0, 100) : 'MCP client';
		const id = randomBytes(16).toString('base64url');
		const createdAt = clock.now().toISOString();
		db.prepare('INSERT INTO oauth_client (id, name, redirect_uris, created_at) VALUES (?, ?, ?, ?)').run(
			id,
			name,
			JSON.stringify(uris),
			createdAt
		);
		return json(
			{
				client_id: id,
				client_id_issued_at: Math.floor(nowMs() / 1000),
				client_name: name,
				redirect_uris: uris,
				token_endpoint_auth_method: 'none',
				grant_types: ['authorization_code', 'refresh_token'],
				response_types: ['code']
			},
			201
		);
	}

	// ---- authorize + consent --------------------------------------------------------------

	const AUTH_FIELDS = [
		'response_type',
		'client_id',
		'redirect_uri',
		'code_challenge',
		'code_challenge_method',
		'state',
		'scope',
		'resource'
	] as const;

	const page = (status: number, body: string) =>
		new Response(
			`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Planner</title>
<body style="font-family:system-ui;max-width:32rem;margin:3rem auto;padding:0 1rem">${body}</body>`,
			{ status, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } }
		);

	function redirectBack(redirectUri: string, params: Record<string, string | null | undefined>): Response {
		const u = new URL(redirectUri);
		for (const [k, v] of Object.entries(params)) if (v) u.searchParams.set(k, v);
		return new Response(null, { status: 302, headers: { location: u.toString(), 'cache-control': 'no-store' } });
	}

	async function authorize(request: Request, url: URL): Promise<Response> {
		const post = request.method === 'POST';
		if (post && request.headers.get('origin') && request.headers.get('origin') !== origin) {
			return page(403, '<p>Cross-site request refused.</p>');
		}
		const form = post ? new URLSearchParams(await request.text()) : url.searchParams;
		const p = Object.fromEntries(AUTH_FIELDS.map((f) => [f, form.get(f)])) as Record<
			(typeof AUTH_FIELDS)[number],
			string | null
		>;

		// Problems with client_id / redirect_uri are shown here, never redirected to the (untrusted) URI.
		const client = getClient(p.client_id);
		if (!client) return page(400, '<p>Unknown client. Register it first.</p>');
		if (!p.redirect_uri || !redirectMatches(client.redirectUris, p.redirect_uri)) {
			return page(400, '<p>This redirect URI is not registered for the client.</p>');
		}
		const back = (params: Record<string, string>) =>
			redirectBack(p.redirect_uri!, { ...params, state: p.state });

		if (p.response_type !== 'code') return back({ error: 'unsupported_response_type' });
		if (!p.code_challenge || p.code_challenge_method !== 'S256') {
			return back({ error: 'invalid_request', error_description: 'PKCE with S256 is required' });
		}
		if (!resourceOk(p.resource)) {
			return back({ error: 'invalid_target', error_description: `resource must be ${resource}` });
		}

		if (!isOwner(request)) {
			if (post) return page(401, '<p>Owner login required.</p>');
			return new Response(null, {
				status: 302,
				headers: { location: `/auth/login?next=${encodeURIComponent(url.pathname + url.search)}` }
			});
		}

		if (!post) {
			const hidden = AUTH_FIELDS.filter((f) => p[f] !== null)
				.map((f) => `<input type="hidden" name="${f}" value="${esc(p[f]!)}">`)
				.join('');
			let host = p.redirect_uri;
			try {
				host = new URL(p.redirect_uri).host;
			} catch {
				/* keep raw */
			}
			return page(
				200,
				`<h1>Allow access?</h1>
<p><b>${esc(client.name)}</b> (redirects to <code>${esc(host)}</code>) wants to read and change your Planner as Claude.</p>
<form method="POST" action="/oauth/authorize">${hidden}
<button name="decision" value="allow">Allow</button>
<button name="decision" value="deny">Deny</button></form>`
			);
		}

		if (form.get('decision') !== 'allow') return back({ error: 'access_denied' });

		const code = random();
		db.prepare('DELETE FROM oauth_code WHERE expires_at < ?').run(nowMs());
		db.prepare(
			'INSERT INTO oauth_code (hash, client_id, redirect_uri, challenge, scope, expires_at) VALUES (?, ?, ?, ?, ?, ?)'
		).run(sha256(code), client.id, p.redirect_uri, p.code_challenge, SCOPE, nowMs() + CODE_TTL_MS);
		return back({ code });
	}

	// ---- token endpoint -----------------------------------------------------------------

	function issueTokens(clientId: string, family: string) {
		const access = random();
		const refresh = random();
		db.prepare(
			`INSERT INTO oauth_token (family, client_id, scope, access_hash, access_expires_at, refresh_hash, refresh_expires_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?)`
		).run(family, clientId, SCOPE, sha256(access), nowMs() + ACCESS_TTL_S * 1000, sha256(refresh), nowMs() + REFRESH_TTL_MS);
		return json({
			access_token: access,
			token_type: 'Bearer',
			expires_in: ACCESS_TTL_S,
			refresh_token: refresh,
			scope: SCOPE
		});
	}

	async function token(request: Request): Promise<Response> {
		if (request.method !== 'POST') return oauthError('invalid_request', 'Use POST', 405);
		const form = new URLSearchParams(await request.text());
		const client = getClient(form.get('client_id'));
		if (!client) return oauthError('invalid_client', 'Unknown client_id', 401);
		if (!resourceOk(form.get('resource'))) return oauthError('invalid_target', `resource must be ${resource}`);

		const grant = form.get('grant_type');
		if (grant === 'authorization_code') {
			const hash = sha256(form.get('code') ?? '');
			const row = db.prepare('SELECT * FROM oauth_code WHERE hash = ?').get(hash) as
				| { client_id: string; redirect_uri: string; challenge: string; expires_at: number }
				| undefined;
			db.prepare('DELETE FROM oauth_code WHERE hash = ?').run(hash); // single use, even on failure
			const verifier = form.get('code_verifier') ?? '';
			const ok =
				row &&
				row.expires_at > nowMs() &&
				row.client_id === client.id &&
				row.redirect_uri === form.get('redirect_uri') &&
				createHash('sha256').update(verifier).digest('base64url') === row.challenge;
			if (!ok) return oauthError('invalid_grant', 'Code is invalid, expired or does not match');
			return issueTokens(client.id, random());
		}

		if (grant === 'refresh_token') {
			const row = db.prepare('SELECT * FROM oauth_token WHERE refresh_hash = ?').get(sha256(form.get('refresh_token') ?? '')) as
				| { id: number; family: string; client_id: string; refresh_expires_at: number; rotated: number; revoked: number }
				| undefined;
			if (!row || row.client_id !== client.id || row.revoked || row.refresh_expires_at <= nowMs()) {
				return oauthError('invalid_grant', 'Refresh token is invalid or expired');
			}
			if (row.rotated) {
				// An already-used refresh token came back: assume theft, kill the whole family.
				db.prepare('UPDATE oauth_token SET revoked = 1 WHERE family = ?').run(row.family);
				return oauthError('invalid_grant', 'Refresh token was already used');
			}
			db.prepare('UPDATE oauth_token SET rotated = 1 WHERE id = ?').run(row.id);
			return issueTokens(client.id, row.family);
		}
		return oauthError('unsupported_grant_type', 'Use authorization_code or refresh_token');
	}

	// ---- public surface -------------------------------------------------------------------

	return {
		resource,
		resourceMetadataUrl: `${origin}/.well-known/oauth-protected-resource/mcp`,

		/** Looks up an access token; undefined when unknown, expired or revoked. */
		verifyAccessToken(accessToken: string): VerifiedToken | undefined {
			const row = db
				.prepare('SELECT client_id, scope, access_expires_at, revoked FROM oauth_token WHERE access_hash = ?')
				.get(sha256(accessToken)) as
				| { client_id: string; scope: string; access_expires_at: number; revoked: number }
				| undefined;
			if (!row || row.revoked || row.access_expires_at <= nowMs()) return undefined;
			return {
				clientId: row.client_id,
				scopes: row.scope.split(' '),
				expiresAt: Math.floor(row.access_expires_at / 1000)
			};
		},

		/** Handles discovery and `/oauth/*`; undefined for any other path. */
		async handle(request: Request): Promise<Response | undefined> {
			const url = new URL(request.url);
			switch (url.pathname) {
				case '/.well-known/oauth-protected-resource':
				case '/.well-known/oauth-protected-resource/mcp':
					return protectedResourceMetadata();
				case '/.well-known/oauth-authorization-server':
				case '/.well-known/openid-configuration':
					return authorizationServerMetadata();
				case '/oauth/register':
					return request.method === 'POST' ? register(request) : oauthError('invalid_request', 'Use POST', 405);
				case '/oauth/authorize':
					return request.method === 'GET' || request.method === 'POST'
						? authorize(request, url)
						: page(405, '<p>Method not allowed.</p>');
				case '/oauth/token':
					return token(request);
			}
			return undefined;
		}
	};
}

export type OAuthServer = ReturnType<typeof createOAuthServer>;
