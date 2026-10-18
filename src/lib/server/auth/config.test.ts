import { describe, expect, it } from 'vitest';
import { loadAuthConfig } from './config.js';

const env = {
	OIDC_ISSUER: 'http://localhost:1411',
	OIDC_CLIENT_ID: 'planner',
	OIDC_CLIENT_SECRET: 'secret',
	OWNER_SUBJECT: 'abc',
	SESSION_SECRET: 'x'.repeat(32),
	PLANNER_URL: 'http://localhost:5173'
};

describe('loadAuthConfig', () => {
	it('reads issuer, client credentials and allowed subject from the environment', () => {
		expect(loadAuthConfig(env)).toMatchObject({
			issuer: 'http://localhost:1411',
			clientId: 'planner',
			clientSecret: 'secret',
			allowedSubject: 'abc',
			publicUrl: 'http://localhost:5173',
			sessionDays: 90
		});
	});

	it('names every missing variable in one error', () => {
		expect(() => loadAuthConfig({ OIDC_ISSUER: 'http://x' })).toThrow(
			/OIDC_CLIENT_ID.*OIDC_CLIENT_SECRET.*OWNER_SUBJECT.*SESSION_SECRET.*PLANNER_URL/s
		);
	});

	it('refuses a session secret that is too short to be safe', () => {
		expect(() => loadAuthConfig({ ...env, SESSION_SECRET: 'short' })).toThrow(/SESSION_SECRET/);
	});
});
