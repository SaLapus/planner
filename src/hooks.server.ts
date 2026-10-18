// A SvelteKit "hook" runs for EVERY request before any page or route.
// `handle` is where we put the login check: the Planner's auth decides whether the
// request continues (and as which Actor) or is answered right here (redirect to login, 401).
import type { Handle } from '@sveltejs/kit/hooks';
import { getAuth } from '#lib/server/auth/instance.js';

export const handle: Handle = async ({ event, resolve }) => {
	const result = await getAuth().handle(event.request);
	if (result.type === 'response') return result.response;
	// Pages read this as `locals.actor`; it is 'owner' for everything coming from the UI.
	if (result.type === 'authenticated') event.locals.actor = result.actor;
	return resolve(event);
};
