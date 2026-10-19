// See https://svelte.dev/docs/kit/types#app.d.ts
import type { Actor } from '#lib/core/index.js';

declare global {
	namespace App {
		interface Locals {
			/** Who is making this request. Set by hooks.server.ts; 'owner' for the UI. */
			actor?: Actor;
		}
	}
}

export {};
