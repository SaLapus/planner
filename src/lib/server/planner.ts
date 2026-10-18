/**
 * Wires the Planner core to the real world: a SQLite file, the system clock
 * and the Home time zone. This is the ONLY place the system clock is touched.
 * It lives under `lib/server`, so SvelteKit refuses to bundle it for the browser.
 */
import { createPlanner, type Planner } from '#lib/core/index.js';
import { openDatabase } from '#lib/core/database.js';

export const HOME_TIME_ZONE = 'Europe/Istanbul';

let instance: Planner | undefined;

export function getPlanner(): Planner {
	instance ??= createPlanner({
		db: openDatabase(process.env.PLANNER_DB ?? 'data/planner.db'),
		clock: { now: () => new Date() },
		homeTimeZone: HOME_TIME_ZONE
	});
	return instance;
}
