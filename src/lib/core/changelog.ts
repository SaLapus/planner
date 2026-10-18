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
	changeLog(): ChangeLogEntry[];
}

export function changeLogModule({ db }: CoreContext): ChangeLogQueries {
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
	return {
		changeLog() {
			return (db.prepare('SELECT * FROM change_log ORDER BY id').all() as unknown as Row[]).map(
				(r) => ({
					id: r.id,
					at: r.at,
					actor: r.actor,
					action: r.action,
					entityType: r.entity_type,
					entityId: r.entity_id,
					before: parse(r.before),
					after: parse(r.after)
				})
			);
		}
	};
}
