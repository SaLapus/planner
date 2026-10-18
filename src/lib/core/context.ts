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
	/** How long deleted items stay restorable in Trash. Default 30. */
	trashRetentionDays?: number;
}

/**
 * How one entity area plugs into the shared safety net (Trash, restore, purge, undo).
 * A "snapshot" is the COMPLETE state of one entity (all its columns plus any rows it owns, such as
 * subtasks) as plain JSON, and always carries `id`. It must be exactly what the entity's commands
 * pass to `record(...)` as before/after, because undo compares and restores these snapshots.
 */
export interface EntityKind<S extends { id: number } = { id: number }> {
	/** The `entityType` used in `record(...)`, e.g. 'task'. */
	type: string;
	/** The current snapshot, or null if no such entity exists. */
	read(id: number): S | null;
	/** Insert-or-replace the entity (and rows it owns) so that `read(id)` returns this snapshot. May throw to refuse. */
	write(snapshot: S): void;
	/** Hard-delete the entity (and rows it owns). Trash keeps the snapshot; callers never see a half-deleted entity. */
	remove(id: number): void;
	/**
	 * The part of a snapshot that undo compares to detect "changed since this entry". Defaults to the
	 * whole snapshot. Use it to leave out data that is merely carried along for Trash (e.g. a Habit's
	 * Check-ins, which are separate entities with their own entries). A `write` that finds the entity
	 * already present should then also leave that carried-along data alone.
	 */
	comparable?(snapshot: S): unknown;
	/** Short human text for Trash/Change log lists. Defaults to `type #id`. */
	label?(snapshot: S): string;
}

export interface EntityRegistry {
	register<S extends { id: number }>(kind: EntityKind<S>): void;
	get(type: string): EntityKind | undefined;
	types(): string[];
}

export interface CoreContext extends PlannerDeps {
	/** Entity areas register themselves here (once, in their module factory) to become trashable and undoable. */
	entities: EntityRegistry;
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
	const kinds = new Map<string, EntityKind>();
	return {
		...deps,
		entities: {
			register: (kind) => void kinds.set(kind.type, kind as unknown as EntityKind),
			get: (type) => kinds.get(type),
			types: () => [...kinds.keys()]
		},
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
