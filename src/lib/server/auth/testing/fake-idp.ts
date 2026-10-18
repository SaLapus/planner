/**
 * A tiny fake OpenID provider for tests: serves discovery and the token endpoint
 * through an injectable `fetch`, so no network or Pocket ID is needed.
 * Codes are one-shot and bound to the nonce and PKCE challenge of the login that asked for them.
 */
import { createHash, randomUUID } from 'node:crypto';

interface IssuedCode {
	sub: string;
	nonce: string;
	clientId: string;
	codeChallenge: string;
}

const b64url = (s: string) => Buffer.from(s).toString('base64url');

export function createFakeIdp(issuer: string) {
	const codes = new Map<string, IssuedCode>();

	const fetchImpl = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
		const url = String(input instanceof Request ? input.url : input);
		if (url === `${issuer}/.well-known/openid-configuration`) {
			return Response.json({
				issuer,
				authorization_endpoint: `${issuer}/authorize`,
				token_endpoint: `${issuer}/api/oidc/token`
			});
		}
		if (url === `${issuer}/api/oidc/token`) {
			const form = new URLSearchParams(String(init?.body));
			const issued = codes.get(form.get('code') ?? '');
			codes.delete(form.get('code') ?? '');
			const verifier = form.get('code_verifier') ?? '';
			const challenge = createHash('sha256').update(verifier).digest('base64url');
			if (!issued || issued.codeChallenge !== challenge || form.get('grant_type') !== 'authorization_code') {
				return Response.json({ error: 'invalid_grant' }, { status: 400 });
			}
			const now = Math.floor(Date.now() / 1000);
			const claims = {
				iss: issuer,
				aud: issued.clientId,
				sub: issued.sub,
				nonce: issued.nonce,
				iat: now,
				exp: now + 3600
			};
			const idToken = `${b64url('{"alg":"none"}')}.${b64url(JSON.stringify(claims))}.sig`;
			return Response.json({ id_token: idToken, access_token: randomUUID(), token_type: 'Bearer' });
		}
		return new Response('not found', { status: 404 });
	};

	return {
		fetch: fetchImpl as typeof fetch,
		/** Pretend the user logged in at the IdP; returns the authorization code. */
		issueCode(c: IssuedCode): string {
			const code = randomUUID();
			codes.set(code, c);
			return code;
		}
	};
}
