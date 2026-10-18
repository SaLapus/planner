/**
 * Planner core: the single deep module that owns all domain rules and
 * persistence. UI routes (and later MCP tools) are thin adapters that call
 * this interface; they contain no domain logic.
 *
 * Rules every command follows:
 *  - takes an Actor as its first argument;
 *  - never reads system time (uses the injected Clock);
 *  - writes exactly one change-log entry, in the same transaction as the mutation.
 */
import type { DatabaseSync } from 'node:sqlite';
import { migrate } from './schema.js';

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

export interface Task {
	id: number;
	title: string;
	/** UTC instant (ISO 8601) or null while open. */
	completedAt: string | null;
	createdAt: string;
}

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

export interface Planner {
	// commands
	createTask(actor: Actor, input: { title: string }): Task;
	completeTask(actor: Actor, id: number): Task;
	uncompleteTask(actor: Actor, id: number): Task;
	// queries
	listTasks(): Task[];
	changeLog(): ChangeLogEntry[];
}

interface TaskRow {
	id: number;
	title: string;
	completed_at: string | null;
	created_at: string;
}

const toTask = (r: TaskRow): Task => ({
	id: r.id,
	title: r.title,
	completedAt: r.completed_at,
	createdAt: r.created_at
});

export function createPlanner({ db, clock }: PlannerDeps): Planner {
	migrate(db);

	const nowIso = () => clock.now().toISOString();

	/** Run `fn` atomically: either everything it wrote is kept, or nothing. */
	function atomically<T>(fn: () => T): T {
		db.exec('BEGIN IMMEDIATE');
		try {
			const result = fn();
			db.exec('COMMIT');
			return result;
		} catch (e) {
			db.exec('ROLLBACK');
			throw e;
		}
	}

	function record(
		actor: Actor,
		action: string,
		entityType: string,
		entityId: number,
		before: unknown,
		after: unknown
	): void {
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

	function getTask(id: number): Task {
		const row = db.prepare('SELECT * FROM task WHERE id = ?').get(id) as TaskRow | undefined;
		if (!row) throw new Error(`Task ${id} not found`);
		return toTask(row);
	}

	function setCompletion(actor: Actor, id: number, complete: boolean): Task {
		return atomically(() => {
			const before = getTask(id);
			if (complete === (before.completedAt !== null)) {
				throw new Error(`Task ${id} is already ${complete ? 'completed' : 'open'}`);
			}
			db.prepare('UPDATE task SET completed_at = ? WHERE id = ?').run(
				complete ? nowIso() : null,
				id
			);
			const after = getTask(id);
			record(actor, complete ? 'task.complete' : 'task.uncomplete', 'task', id, before, after);
			return after;
		});
	}

	return {
		createTask(actor, input) {
			const title = input.title.trim();
			if (!title) throw new Error('Task title must not be empty');
			return atomically(() => {
				const { lastInsertRowid } = db
					.prepare('INSERT INTO task (title, created_at) VALUES (?, ?)')
					.run(title, nowIso());
				const task = getTask(Number(lastInsertRowid));
				record(actor, 'task.create', 'task', task.id, null, task);
				return task;
			});
		},
		completeTask: (actor, id) => setCompletion(actor, id, true),
		uncompleteTask: (actor, id) => setCompletion(actor, id, false),
		listTasks() {
			return (db.prepare('SELECT * FROM task ORDER BY id').all() as unknown as TaskRow[]).map(
				toTask
			);
		},
		changeLog() {
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
