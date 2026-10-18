/**
 * Signed, stateless cookie values: `base64url(json).base64url(hmac)`.
 * Used for the login session and for the short-lived "login in progress" cookie.
 * Nothing secret is inside; the signature only proves the server issued it.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

function mac(secret: string, body: string): Buffer {
	return createHmac('sha256', secret).update(body).digest();
}

export function sign(secret: string, payload: object): string {
	const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
	return `${body}.${mac(secret, body).toString('base64url')}`;
}

/** Returns the payload, or undefined when the value is malformed or the signature is wrong. */
export function verify<T>(secret: string, value: string | undefined): T | undefined {
	if (!value) return undefined;
	const [body, signature, ...rest] = value.split('.');
	if (!body || !signature || rest.length) return undefined;
	const given = Buffer.from(signature, 'base64url');
	const expected = mac(secret, body);
	if (given.length !== expected.length || !timingSafeEqual(given, expected)) return undefined;
	try {
		return JSON.parse(Buffer.from(body, 'base64url').toString()) as T;
	} catch {
		return undefined;
	}
}
