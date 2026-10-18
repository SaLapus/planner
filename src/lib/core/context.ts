/**
 * Shared plumbing for the core's entity modules (tasks.ts, changelog.ts, ...).
 * Each module receives a `CoreContext` and returns its slice of the `Planner` interface.
 */
import type { DatabaseSync } from 'node:sqlite';

export type Actor = 'owner' | 'claude';

export interface Clock {
	now(): Date;
}

export interface PlannerDeps {
	db: DatabaseSync;
	clock: Clock;
	/** IANA zone used for "local dates" (e.g. 'Europe/Istanbul'). Never assume a fixed offset. */
	homeTimeZone: string;
}

export interface CoreContext extends PlannerDeps {
	nowIso(): string;
	/** Run `fn` atomically: either everything it wrote is kept, or nothing. */
	atomically<T>(fn: () => T): T;
	/** Write exactly one change-log entry; call it once per command, inside `atomically`. */
	record(
		actor: Actor,
		action: string,
		entityType: string,
		entityId: number,
		before: unknown,
		after: unknown
	): void;
}

export function createContext(deps: PlannerDeps): CoreContext {
	const { db, clock } = deps;
	const nowIso = () => clock.now().toISOString();
	return {
		...deps,
		nowIso,
		atomically(fn) {
			db.exec('BEGIN IMMEDIATE');
			try {
				const result = fn();
				db.exec('COMMIT');
				return result;
			} catch (e) {
				db.exec('ROLLBACK');
				throw e;
			}
		},
		record(actor, action, entityType, entityId, before, after) {
			db.prepare(
				`INSERT INTO change_log (at, actor, action, entity_type, entity_id, before, after)
				 VALUES (?, ?, ?, ?, ?, ?, ?)`
			).run(
				nowIso(),
				actor,
				action,
				entityType,
				entityId,
				before === null ? null : JSON.stringify(before),
				after === null ? null : JSON.stringify(after)
			);
		}
	};
}
