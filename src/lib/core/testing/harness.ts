/**
 * Core-seam test harness. Every core test starts here:
 *
 *   const { planner, clock } = createTestPlanner();
 *
 * You get a fresh in-memory SQLite database, a Clock you control, and a
 * configurable Home time zone. No files, no system time, no shared state.
 */
import { DatabaseSync } from 'node:sqlite';
import { createPlanner, type Clock, type Planner } from '../index.js';

export interface FakeClock extends Clock {
	/** Jump to an absolute moment. */
	set(iso: string): void;
	/** Move forward by milliseconds. */
	advance(ms: number): void;
}

export function createFakeClock(startIso = '2026-01-05T09:00:00.000Z'): FakeClock {
	let current = new Date(startIso).getTime();
	return {
		now: () => new Date(current),
		set: (iso) => {
			current = new Date(iso).getTime();
		},
		advance: (ms) => {
			current += ms;
		}
	};
}

export interface TestPlannerOptions {
	/** Defaults to the production Home time zone. */
	homeTimeZone?: string;
	/** Initial fake time (ISO string). */
	now?: string;
}

export function createTestPlanner(options: TestPlannerOptions = {}): {
	planner: Planner;
	clock: FakeClock;
	/** The in-memory database behind `planner`; for infrastructure that shares it (e.g. OAuth tokens), not for assertions. */
	db: DatabaseSync;
} {
	const clock = createFakeClock(options.now);
	const db = new DatabaseSync(':memory:');
	const planner = createPlanner({
		db,
		clock,
		homeTimeZone: options.homeTimeZone ?? 'Europe/Istanbul'
	});
	return { planner, clock, db };
}
