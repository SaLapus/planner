// The Schedule root opens the Week containing today (Home time zone). A temporary, uncached
// redirect, so it lands on today's Week even after midnight.
import { getPlanner } from '#lib/server/planner.js';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = () =>
	new Response(null, {
		status: 307,
		headers: { location: `/events/week/${getPlanner().today()}`, 'cache-control': 'no-store' }
	});
