import { describe, expect, it } from 'vitest';
import { createAuth, type AuthConfig } from './index.js';
import { createFakeIdp } from './testing/fake-idp.js';

const ISSUER = 'https://id.example.test';
const config: AuthConfig = {
	issuer: ISSUER,
	clientId: 'planner',
	clientSecret: 'shh',
	allowedSubject: 'owner-sub',
	sessionSecret: 'a-long-random-test-secret',
	publicUrl: 'https://plan.example.test',
	sessionDays: 90
};

function setup(overrides: Partial<AuthConfig> = {}) {
	const idp = createFakeIdp(ISSUER);
	const now = { value: new Date('2026-01-05T09:00:00Z') };
	const auth = createAuth({
		config: { ...config, ...overrides },
		fetch: idp.fetch,
		clock: { now: () => now.value }
	});
	return { auth, idp, now };
}

const get = (path: string, cookie?: string) =>
	new Request('https://plan.example.test' + path, { headers: cookie ? { cookie } : {} });

/** "name=value" pairs from Set-Cookie headers, as a browser would send them back. */
function cookiesFrom(res: Response): string {
	return res.headers
		.getSetCookie()
		.filter((c) => !/Max-Age=0/i.test(c))
		.map((c) => c.split(';')[0])
		.join('; ');
}

function responseOf(result: Awaited<ReturnType<ReturnType<typeof createAuth>['handle']>>) {
	if (result.type !== 'response') throw new Error(`expected a response, got ${result.type}`);
	return result.response;
}

/** Runs the whole login dance as the given subject; returns the callback response. */
async function logIn(s: ReturnType<typeof setup>, sub = 'owner-sub') {
	const start = responseOf(await s.auth.handle(get('/')));
	const authUrl = new URL(start.headers.get('location')!);
	const code = s.idp.issueCode({
		sub,
		nonce: authUrl.searchParams.get('nonce')!,
		clientId: authUrl.searchParams.get('client_id')!,
		codeChallenge: authUrl.searchParams.get('code_challenge')!
	});
	const state = authUrl.searchParams.get('state')!;
	return responseOf(
		await s.auth.handle(get(`/auth/callback?code=${code}&state=${state}`, cookiesFrom(start)))
	);
}

describe('login redirect', () => {
	it('sends an unauthenticated page visit to the Pocket ID authorize endpoint', async () => {
		const { auth } = setup();
		const res = responseOf(await auth.handle(get('/')));
		expect(res.status).toBe(302);
		const url = new URL(res.headers.get('location')!);
		expect(url.origin + url.pathname).toBe(`${ISSUER}/authorize`);
		expect(url.searchParams.get('client_id')).toBe('planner');
		expect(url.searchParams.get('response_type')).toBe('code');
		expect(url.searchParams.get('scope')).toContain('openid');
		expect(url.searchParams.get('redirect_uri')).toBe('https://plan.example.test/auth/callback');
		expect(url.searchParams.get('code_challenge_method')).toBe('S256');
	});

	it('answers UI API routes with 401 instead of a redirect', async () => {
		const { auth } = setup();
		expect(responseOf(await auth.handle(get('/api/tasks'))).status).toBe(401);
	});
});

describe('callback', () => {
	it('lets the allowed subject in with a secure, http-only, long-lived cookie, back to the page they wanted', async () => {
		const res = await logIn(setup());
		expect(res.status).toBe(302);
		expect(res.headers.get('location')).toBe('/');
		const session = res.headers.getSetCookie().find((c) => c.startsWith('planner_session='))!;
		expect(session).toMatch(/HttpOnly/i);
		expect(session).toMatch(/Secure/i);
		expect(session).toMatch(/SameSite=Lax/i);
		expect(session).toMatch(/Path=\//);
		expect(Number(/Max-Age=(\d+)/i.exec(session)![1])).toBe(90 * 24 * 3600);
	});

	it('treats a request carrying that cookie as the owner', async () => {
		const s = setup();
		const cookie = cookiesFrom(await logIn(s));
		expect(await s.auth.handle(get('/', cookie))).toEqual({ type: 'authenticated', actor: 'owner' });
	});

	it('refuses any other Pocket ID account and gives no session', async () => {
		const s = setup();
		const res = await logIn(s, 'someone-else');
		expect(res.headers.get('location')).toBe('/auth/denied');
		expect(res.headers.getSetCookie().some((c) => c.startsWith('planner_session='))).toBe(false);
		expect((await s.auth.handle(get('/', cookiesFrom(res)))).type).toBe('response');
	});

	it('rejects a callback whose state does not match the login that started it', async () => {
		const { auth } = setup();
		const start = responseOf(await auth.handle(get('/')));
		const res = responseOf(
			await auth.handle(get('/auth/callback?code=x&state=forged', cookiesFrom(start)))
		);
		expect(res.status).toBe(400);
	});

	it('rejects a callback with no login cookie at all', async () => {
		const { auth } = setup();
		expect(responseOf(await auth.handle(get('/auth/callback?code=x&state=y'))).status).toBe(400);
	});

	it('rejects a code that was not issued by the IdP', async () => {
		const { auth } = setup();
		const start = responseOf(await auth.handle(get('/')));
		const state = new URL(start.headers.get('location')!).searchParams.get('state');
		const res = responseOf(
			await auth.handle(get(`/auth/callback?code=bogus&state=${state}`, cookiesFrom(start)))
		);
		expect(res.status).toBe(400);
	});

	it('returns to the page the visitor originally asked for, but never to another site', async () => {
		const s = setup();
		const start = responseOf(await s.auth.handle(get('/tasks?x=1')));
		const u = new URL(start.headers.get('location')!);
		const code = s.idp.issueCode({
			sub: 'owner-sub',
			nonce: u.searchParams.get('nonce')!,
			clientId: 'planner',
			codeChallenge: u.searchParams.get('code_challenge')!
		});
		const cb = responseOf(
			await s.auth.handle(
				get(`/auth/callback?code=${code}&state=${u.searchParams.get('state')}`, cookiesFrom(start))
			)
		);
		expect(cb.headers.get('location')).toBe('/tasks?x=1');

		const evil = responseOf(await s.auth.handle(get('/auth/login?next=//evil.example/x')));
		const eu = new URL(evil.headers.get('location')!);
		const code2 = s.idp.issueCode({
			sub: 'owner-sub',
			nonce: eu.searchParams.get('nonce')!,
			clientId: 'planner',
			codeChallenge: eu.searchParams.get('code_challenge')!
		});
		const cb2 = responseOf(
			await s.auth.handle(
				get(`/auth/callback?code=${code2}&state=${eu.searchParams.get('state')}`, cookiesFrom(evil))
			)
		);
		expect(cb2.headers.get('location')).toBe('/');
	});
});

describe('session lifetime and tampering', () => {
	it('stays valid for 90 days and expires after', async () => {
		const s = setup();
		const cookie = cookiesFrom(await logIn(s));
		s.now.value = new Date('2026-04-04T09:00:00Z'); // day 89
		expect((await s.auth.handle(get('/', cookie))).type).toBe('authenticated');
		s.now.value = new Date('2026-04-06T09:00:00Z'); // day 91
		expect((await s.auth.handle(get('/', cookie))).type).toBe('response');
	});

	it('rejects a cookie whose content was altered', async () => {
		const s = setup();
		const cookie = cookiesFrom(await logIn(s));
		const i = cookie.indexOf('=');
		const value = cookie.slice(i + 1);
		const forged = cookie.slice(0, i + 1) + (value[0] === 'A' ? 'B' : 'A') + value.slice(1);
		expect((await s.auth.handle(get('/', forged))).type).toBe('response');
	});

	it('rejects a valid session once the allowed subject is reconfigured', async () => {
		const s = setup();
		const cookie = cookiesFrom(await logIn(s));
		const other = createAuth({
			config: { ...config, allowedSubject: 'new-owner' },
			fetch: s.idp.fetch,
			clock: { now: () => s.now.value }
		});
		expect((await other.handle(get('/', cookie))).type).toBe('response');
	});
});

describe('logout', () => {
	it('clears the session cookie', async () => {
		const s = setup();
		const cookie = cookiesFrom(await logIn(s));
		const out = responseOf(
			await s.auth.handle(
				new Request('https://plan.example.test/auth/logout', { method: 'POST', headers: { cookie } })
			)
		);
		expect(out.status).toBe(302);
		const cleared = out.headers.getSetCookie().find((c) => c.startsWith('planner_session='))!;
		expect(cleared).toMatch(/Max-Age=0/i);
	});
});

describe('public paths', () => {
	it('shows the refusal page without a session', async () => {
		const { auth } = setup();
		expect(await auth.handle(get('/auth/denied'))).toEqual({ type: 'public' });
	});
});
