/**
 * Which requests the service worker may answer from its cache.
 * Only the listed app-shell files (built JS/CSS, icons, manifest) from our own origin, GET only.
 * Everything else (pages, task data, login, /mcp, /oauth) always goes to the network: no data caching.
 */
export function isShellRequest(req: {
	method: string;
	url: string;
	origin: string;
	shellPaths: ReadonlySet<string>;
}): boolean {
	if (req.method !== 'GET') return false;
	const url = new URL(req.url);
	if (url.origin !== req.origin) return false;
	return req.shellPaths.has(url.pathname);
}
