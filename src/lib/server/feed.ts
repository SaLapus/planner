/**
 * HTTP side of the Calendar feed. `/feed/<secret>.ics` is the one page that needs NO login (calendar
 * apps cannot log in); the secret in the URL is the whole protection. Anything that is not exactly
 * the current secret gets a plain 404, so a wrong or revoked URL reveals nothing.
 */
import type { Planner } from '#lib/core/index.js';

/** True for paths under `/feed/`; hooks.server.ts lets them past the login check. */
export const isFeedPath = (pathname: string) => pathname.startsWith('/feed/');

const NOT_FOUND = () => new Response('Not found', { status: 404 });

/** `file` is the last URL segment, e.g. "<secret>.ics". */
export function feedResponse(planner: Pick<Planner, 'calendarFeed' | 'isFeedSecret'>, file: string): Response {
	if (!file.endsWith('.ics')) return NOT_FOUND();
	if (!planner.isFeedSecret(file.slice(0, -'.ics'.length))) return NOT_FOUND();
	return new Response(planner.calendarFeed(), {
		headers: {
			'content-type': 'text/calendar; charset=utf-8',
			// Calendar apps poll on their own schedule; five minutes of caching is fine for them
			// and `private` keeps shared caches from storing a URL that is a secret.
			'cache-control': 'private, max-age=300'
		}
	});
}
