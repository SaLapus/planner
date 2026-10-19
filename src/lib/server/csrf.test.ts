import { describe, expect, it } from 'vitest';
import { isCrossSiteFormPost } from './csrf.js';

const SELF = 'https://plan.example.com';
const req = (method: string, headers: Record<string, string>) =>
	new Request(`${SELF}/tasks?/create`, { method, headers, body: method === 'GET' ? undefined : 'a=1' });

describe('isCrossSiteFormPost (the UI form CSRF check)', () => {
	it('allows a form post from the Planner itself', () => {
		const r = req('POST', { origin: SELF, 'content-type': 'application/x-www-form-urlencoded' });
		expect(isCrossSiteFormPost(r, SELF)).toBe(false);
	});

	it('refuses form posts from another site or with no Origin', () => {
		for (const type of ['application/x-www-form-urlencoded', 'multipart/form-data; boundary=x', 'text/plain']) {
			expect(isCrossSiteFormPost(req('POST', { origin: 'https://evil.example', 'content-type': type }), SELF)).toBe(true);
			expect(isCrossSiteFormPost(req('POST', { 'content-type': type }), SELF)).toBe(true);
		}
		expect(isCrossSiteFormPost(req('DELETE', { origin: 'https://evil.example', 'content-type': 'text/plain' }), SELF)).toBe(true);
	});

	it('leaves GET and JSON requests alone (browsers cannot send cross-site JSON without CORS)', () => {
		expect(isCrossSiteFormPost(new Request(`${SELF}/`, { headers: { origin: 'https://evil.example' } }), SELF)).toBe(false);
		const json = req('POST', { origin: 'https://evil.example', 'content-type': 'application/json' });
		expect(isCrossSiteFormPost(json, SELF)).toBe(false);
	});
});
