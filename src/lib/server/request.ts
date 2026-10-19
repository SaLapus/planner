// Small helpers shared by the server half of every route (`+page.server.ts`).
import type { Actor } from '#lib/core/index.js';

/** The logged-in actor. Every UI request passed the login check in hooks.server.ts, which sets `locals.actor`. */
export function actorOf(locals: App.Locals): Actor {
	if (!locals.actor) throw new Error('Not authenticated');
	return locals.actor;
}

/** The message of a failed core command, for the `error` a form action returns. */
export const errorText = (e: unknown): string => (e instanceof Error ? e.message : 'Ошибка');
