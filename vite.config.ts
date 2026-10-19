import adapter from '@sveltejs/adapter-node';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	plugins: [
		sveltekit({
			adapter: adapter(),
			// SvelteKit's form CSRF check is off because it also blocked the OAuth token endpoint;
			// the same check runs in hooks.server.ts for everything except the connector (see lib/server/csrf.ts).
			csrf: { trustedOrigins: ['*'] }
		})
	],
	test: {
		include: ['src/**/*.test.ts']
	}
});
