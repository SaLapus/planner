/**
 * Owner login via OpenID Connect (Pocket ID), authorization-code flow with PKCE.
 *
 * `createAuth({ config, fetch, clock })` is the whole seam: give it a Request, get back
 * either a Response to send (redirect to login, 401, ...), `public` (page needs no session)
 * or `authenticated` with the Actor. It knows nothing about SvelteKit, so tests (and the
 * later MCP contract tests) can build it with a fake `fetch` / test config.
 *
 * Sessions are signed cookies, so there is no session table to manage. Logging out clears
 * the cookie in the browser.
 *
 * The ID token comes straight from the token endpoint over TLS, which the OIDC spec
 * (section 3.1.3.7) accepts without checking its signature; we still check iss, aud, exp, nonce.
 */
import { createHash, randomBytes } from 'node:crypto';
import type { Actor } from '#lib/core/index.js';
import { sign, verify } from './session.js';

export interface AuthConfig {
	/** Pocket ID base URL, e.g. https://id.example.com */
	issuer: string;
	clientId: string;
	clientSecret: string;
	/** The one Pocket ID user (`sub`) allowed in. */
	allowedSubject: string;
	/** Long random string used to sign cookies. */
	sessionSecret: string;
	/** Where the Planner is reached from the browser, e.g. https://plan.example.com */
	publicUrl: string;
	sessionDays: number;
}

export interface AuthDeps {
	config: AuthConfig;
	fetch: typeof fetch;
	clock: { now(): Date };
}

export type AuthResult =
	| { type: 'authenticated'; actor: Actor }
	| { type: 'public' }
	| { type: 'response'; response: Response };

const SESSION_COOKIE = 'planner_session';
const LOGIN_COOKIE = 'planner_login';
const LOGIN_MAX_AGE = 600; // seconds to finish the passkey prompt

interface SessionPayload {
	sub: string;
	exp: number; // ms since epoch
}
interface LoginPayload {
	state: string;
	nonce: string;
	verifier: string;
	next: string;
	exp: number;
}

export function createAuth({ config, fetch: doFetch, clock }: AuthDeps) {
	const secure = new URL(config.publicUrl).protocol === 'https:';
	const redirectUri = new URL('/auth/callback', config.publicUrl).toString();
	const issuer = config.issuer.replace(/\/$/, '');
	let discovered: { authorization_endpoint: string; token_endpoint: string; issuer: string } | undefined;

	async function discover() {
		if (!discovered) {
			const res = await doFetch(`${issuer}/.well-known/openid-configuration`);
			if (!res.ok) throw new Error(`OIDC discovery failed (${res.status})`);
			discovered = await res.json();
		}
		return discovered!;
	}

	function cookie(name: string, value: string, maxAge: number): string {
		return [
			`${name}=${value}`,
			'Path=/',
			`Max-Age=${maxAge}`,
			'HttpOnly',
			'SameSite=Lax',
			...(secure ? ['Secure'] : [])
		].join('; ');
	}

	function redirect(location: string, cookies: string[] = []): AuthResult {
		const headers = new Headers({ location });
		for (const c of cookies) headers.append('set-cookie', c);
		return { type: 'response', response: new Response(null, { status: 302, headers }) };
	}

	function fail(status: number, message: string): AuthResult {
		return { type: 'response', response: new Response(message, { status }) };
	}

	function readCookie(request: Request, name: string): string | undefined {
		for (const part of (request.headers.get('cookie') ?? '').split(';')) {
			const i = part.indexOf('=');
			if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
		}
		return undefined;
	}

	function hasSession(request: Request): boolean {
		const s = verify<SessionPayload>(config.sessionSecret, readCookie(request, SESSION_COOKIE));
		return !!s && s.exp > clock.now().getTime() && s.sub === config.allowedSubject;
	}

	/** Only same-site relative paths; anything else (e.g. //evil.example) becomes "/". */
	function safeNext(next: string | null): string {
		return next && /^\/(?![/\\])/.test(next) ? next : '/';
	}

	async function startLogin(next: string): Promise<AuthResult> {
		const { authorization_endpoint } = await discover();
		const state = randomBytes(16).toString('base64url');
		const nonce = randomBytes(16).toString('base64url');
		const verifier = randomBytes(32).toString('base64url');
		const url = new URL(authorization_endpoint);
		url.search = new URLSearchParams({
			response_type: 'code',
			client_id: config.clientId,
			redirect_uri: redirectUri,
			scope: 'openid',
			state,
			nonce,
			code_challenge: createHash('sha256').update(verifier).digest('base64url'),
			code_challenge_method: 'S256'
		}).toString();
		const login: LoginPayload = {
			state,
			nonce,
			verifier,
			next,
			exp: clock.now().getTime() + LOGIN_MAX_AGE * 1000
		};
		return redirect(url.toString(), [
			cookie(LOGIN_COOKIE, sign(config.sessionSecret, login), LOGIN_MAX_AGE)
		]);
	}

	async function finishLogin(request: Request, url: URL): Promise<AuthResult> {
		const login = verify<LoginPayload>(config.sessionSecret, readCookie(request, LOGIN_COOKIE));
		if (!login || login.exp <= clock.now().getTime() || login.state !== url.searchParams.get('state')) {
			return fail(400, 'Login attempt expired or invalid. Please try again.');
		}
		const code = url.searchParams.get('code');
		if (!code) return fail(400, 'Missing authorization code.');

		const sub = await exchangeCode(code, login);
		if (!sub) return fail(400, 'Login failed. Please try again.');

		const clearLogin = cookie(LOGIN_COOKIE, '', 0);
		if (sub !== config.allowedSubject) return redirect('/auth/denied', [clearLogin]);

		const maxAge = config.sessionDays * 24 * 3600;
		const session: SessionPayload = { sub, exp: clock.now().getTime() + maxAge * 1000 };
		return redirect(login.next, [
			clearLogin,
			cookie(SESSION_COOKIE, sign(config.sessionSecret, session), maxAge)
		]);
	}

	/** Trades the code for an ID token and returns its `sub`, or undefined if anything is off. */
	async function exchangeCode(code: string, login: LoginPayload): Promise<string | undefined> {
		const meta = await discover();
		const res = await doFetch(meta.token_endpoint, {
			method: 'POST',
			headers: { 'content-type': 'application/x-www-form-urlencoded' },
			body: new URLSearchParams({
				grant_type: 'authorization_code',
				code,
				redirect_uri: redirectUri,
				client_id: config.clientId,
				client_secret: config.clientSecret,
				code_verifier: login.verifier
			})
		});
		if (!res.ok) return undefined;
		const { id_token } = (await res.json()) as { id_token?: string };
		const body = id_token?.split('.')[1];
		if (!body) return undefined;
		let claims: { iss?: string; aud?: string | string[]; sub?: string; nonce?: string; exp?: number };
		try {
			claims = JSON.parse(Buffer.from(body, 'base64url').toString());
		} catch {
			return undefined;
		}
		const aud = [claims.aud ?? []].flat();
		const ok =
			claims.iss?.replace(/\/$/, '') === issuer &&
			aud.includes(config.clientId) &&
			claims.nonce === login.nonce &&
			typeof claims.exp === 'number' &&
			claims.exp * 1000 > clock.now().getTime() &&
			!!claims.sub;
		return ok ? claims.sub : undefined;
	}

	return {
		/** True when the request carries a valid owner session cookie (used by the OAuth authorize step). */
		isOwner: hasSession,
		async handle(request: Request): Promise<AuthResult> {
			const url = new URL(request.url);
			const path = url.pathname;

			if (path === '/auth/denied' || path === '/auth/logged-out') return { type: 'public' };
			if (path === '/auth/login') return startLogin(safeNext(url.searchParams.get('next')));
			if (path === '/auth/callback') return finishLogin(request, url);
			if (path === '/auth/logout') {
				if (request.method !== 'POST') return fail(405, 'Use POST to log out.');
				return redirect('/auth/logged-out', [cookie(SESSION_COOKIE, '', 0)]);
			}

			if (hasSession(request)) return { type: 'authenticated', actor: 'owner' };
			if (path.startsWith('/api/')) return fail(401, 'Unauthorized');
			return startLogin(safeNext(path + url.search));
		}
	};
}

export type Auth = ReturnType<typeof createAuth>;
