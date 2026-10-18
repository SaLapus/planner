/// <reference lib="webworker" />
// Caches only the app shell so the app installs and starts fast. No task data is ever cached.
import { self } from '$app/service-worker';
import { version } from '$app/env';
import { immutable, assets } from '$app/manifest';
import { resolve } from '$app/paths';
import { isShellRequest } from './rules.js';

const CACHE = `shell-${version}`;
const SHELL = [...immutable, ...assets].map((a) => resolve(a.path));
const SHELL_PATHS: ReadonlySet<string> = new Set(SHELL);

self.addEventListener('install', (event) => {
	event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)));
});

self.addEventListener('activate', (event) => {
	event.waitUntil(
		caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
	);
});

self.addEventListener('fetch', (event) => {
	const { request } = event;
	const origin = self.location.origin;
	if (!isShellRequest({ method: request.method, url: request.url, origin, shellPaths: SHELL_PATHS })) return;
	event.respondWith(caches.match(new URL(request.url).pathname).then((hit) => hit ?? fetch(request)));
});
