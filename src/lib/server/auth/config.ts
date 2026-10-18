import type { AuthConfig } from './index.js';

const REQUIRED = [
	'OIDC_ISSUER',
	'OIDC_CLIENT_ID',
	'OIDC_CLIENT_SECRET',
	'OWNER_SUBJECT',
	'SESSION_SECRET',
	'PLANNER_URL'
] as const;

/** Reads the login settings from environment variables; fails loudly if any are missing. */
export function loadAuthConfig(env: Record<string, string | undefined>): AuthConfig {
	const missing = REQUIRED.filter((name) => !env[name]);
	if (missing.length) throw new Error(`Missing environment variables: ${missing.join(', ')}`);
	if (env.SESSION_SECRET!.length < 32) {
		throw new Error('SESSION_SECRET must be at least 32 characters (openssl rand -base64 32)');
	}
	return {
		issuer: env.OIDC_ISSUER!,
		clientId: env.OIDC_CLIENT_ID!,
		clientSecret: env.OIDC_CLIENT_SECRET!,
		allowedSubject: env.OWNER_SUBJECT!,
		sessionSecret: env.SESSION_SECRET!,
		publicUrl: env.PLANNER_URL!,
		sessionDays: 90
	};
}
