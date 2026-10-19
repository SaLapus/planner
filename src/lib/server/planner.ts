/**
 * Wires the Planner core to the real world: a SQLite file, the system clock
 * and the Home time zone. This is the ONLY place the system clock is touched.
 * It lives under `lib/server`, so SvelteKit refuses to bundle it for the browser.
 */
import { createPlanner, type Planner } from '#lib/core/index.js';
import type { DatabaseSync } from 'node:sqlite';
import { openDatabase } from '#lib/core/database.js';

export const HOME_TIME_ZONE = 'Europe/Istanbul';

/** How often the running server empties expired items from Trash. */
const PURGE_EVERY_MS = 60 * 60 * 1000;

let instance: Planner | undefined;
let database: DatabaseSync | undefined;

/** The one SQLite handle; shared with infrastructure that keeps its own tables (OAuth tokens). */
export function getDatabase(): DatabaseSync {
	database ??= openDatabase(process.env.PLANNER_DB ?? 'data/planner.db');
	return database;
}

export function getPlanner(): Planner {
	if (!instance) {
		const planner = createPlanner({
			db: getDatabase(),
			clock: { now: () => new Date() },
			homeTimeZone: HOME_TIME_ZONE,
			trashRetentionDays: 30
		});
		instance = planner;
		// Purge runs inside the app: once when the planner is first built (server start, or the
		// first request after it), then every hour. Items older than the retention (by the Clock)
		// are removed for good. There is no cron job and nothing else to set up.
		const purge = () => {
			try {
				planner.purgeTrash();
			} catch (e) {
				console.error('Trash purge failed', e);
			}
		};
		purge();
		setInterval(purge, PURGE_EVERY_MS).unref();
	}
	return instance;
}
