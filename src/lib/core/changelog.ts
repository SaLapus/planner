import type { DatabaseSync } from 'node:sqlite';
import type { Actor, CoreContext } from './context.js';

export interface ChangeLogEntry {
	id: number;
	at: string;
	actor: Actor;
	action: string;
	entityType: string;
	entityId: number;
	before: unknown;
	after: unknown;
}

export interface ChangeLogQueries {
	/** Oldest first. Optionally only the entries made by one actor. */
	changeLog(filter?: { actor?: Actor }): ChangeLogEntry[];
}

type Row = {
	id: number;
	at: string;
	actor: Actor;
	action: string;
	entity_type: string;
	entity_id: number;
	before: string | null;
	after: string | null;
};
const parse = (s: string | null) => (s === null ? null : JSON.parse(s));
const toEntry = (r: Row): ChangeLogEntry => ({
	id: r.id,
	at: r.at,
	actor: r.actor,
	action: r.action,
	entityType: r.entity_type,
	entityId: r.entity_id,
	before: parse(r.before),
	after: parse(r.after)
});

/** Internal helper (used by undo): one entry by id. */
export function getChangeEntry(db: DatabaseSync, id: number): ChangeLogEntry | undefined {
	const row = db.prepare('SELECT * FROM change_log WHERE id = ?').get(id) as Row | undefined;
	return row && toEntry(row);
}

/** Internal helper: the newest entry of the whole log. */
export function lastChangeEntry(db: DatabaseSync): ChangeLogEntry {
	return toEntry(db.prepare('SELECT * FROM change_log ORDER BY id DESC LIMIT 1').get() as Row);
}

/** Internal helper: the newest entry about one entity that is newer than `afterId`. */
export function laterChangeEntry(
	db: DatabaseSync,
	entityType: string,
	entityId: number,
	afterId: number
): ChangeLogEntry | undefined {
	const row = db
		.prepare(
			'SELECT * FROM change_log WHERE entity_type = ? AND entity_id = ? AND id > ? ORDER BY id DESC LIMIT 1'
		)
		.get(entityType, entityId, afterId) as Row | undefined;
	return row && toEntry(row);
}

export function changeLogModule({ db }: CoreContext): ChangeLogQueries {
	return {
		changeLog(filter) {
			const rows = filter?.actor
				? db.prepare('SELECT * FROM change_log WHERE actor = ? ORDER BY id').all(filter.actor)
				: db.prepare('SELECT * FROM change_log ORDER BY id').all();
			return (rows as unknown as Row[]).map(toEntry);
		}
	};
}
