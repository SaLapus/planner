import { describe, expect, it } from 'vitest';
import { isShellRequest } from './rules.js';

const shell = new Set(['/_app/immutable/entry/start.js', '/manifest.webmanifest', '/icon-192.png']);
const ask = (method: string, url: string) =>
	isShellRequest({ method, url, origin: 'https://plan.example.com', shellPaths: shell });

describe('service worker caching rules', () => {
	it('serves listed app-shell files from the cache', () => {
		expect(ask('GET', 'https://plan.example.com/_app/immutable/entry/start.js')).toBe(true);
		expect(ask('GET', 'https://plan.example.com/icon-192.png')).toBe(true);
	});

	it('never touches pages, data, auth or the connector endpoints', () => {
		for (const path of ['/', '/auth/login', '/mcp', '/oauth/token', '/.well-known/oauth-authorization-server']) {
			expect(ask('GET', 'https://plan.example.com' + path)).toBe(false);
		}
	});

	it('never touches non-GET requests, even for shell paths', () => {
		expect(ask('POST', 'https://plan.example.com/icon-192.png')).toBe(false);
	});

	it('never touches other origins', () => {
		expect(ask('GET', 'https://id.example.com/icon-192.png')).toBe(false);
	});

	it('ignores the query string when matching', () => {
		expect(ask('GET', 'https://plan.example.com/icon-192.png?v=2')).toBe(true);
	});
});
