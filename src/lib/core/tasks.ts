import type { DatabaseSync } from 'node:sqlite';
import type { Actor, CoreContext } from './context.js';
import { assertProjectOpen, cleanTag } from './organising.js';

export interface Task {
	id: number;
	title: string;
	/** UTC instant (ISO 8601) or null while open. */
	completedAt: string | null;
	createdAt: string;
	/** Project this Task belongs to (0..1). Managed by organising.ts. */
	projectId: number | null;
	/** Free-form tags, sorted. Managed by organising.ts. */
	tags: string[];
	/** One-level checklist, in order. Managed by organising.ts. */
	subtasks: Subtask[];
}

export interface Subtask {
	id: number;
	title: string;
	done: boolean;
}

export interface TaskFilter {
	/** A project id, or null for tasks without a project. Omit for any. */
	projectId?: number | null;
	tag?: string;
}

export interface TaskApi {
	createTask(
		actor: Actor,
		input: { title: string; projectId?: number | null; tags?: string[] }
	): Task;
	getTask(id: number): Task;
	completeTask(actor: Actor, id: number): Task;
	uncompleteTask(actor: Actor, id: number): Task;
	listTasks(filter?: TaskFilter): Task[];
}

interface TaskRow {
	id: number;
	title: string;
	completed_at: string | null;
	created_at: string;
	project_id: number | null;
}

/** Reads a Task with its project, tags and subtasks. Shared with organising.ts. */
export function readTask(db: DatabaseSync, id: number): Task {
	const row = db.prepare('SELECT * FROM task WHERE id = ?').get(id) as TaskRow | undefined;
	if (!row) throw new Error(`Task ${id} not found`);
	return toTask(db, row);
}

function toTask(db: DatabaseSync, r: TaskRow): Task {
	const tags = db.prepare('SELECT tag FROM task_tag WHERE task_id = ? ORDER BY tag').all(r.id) as {
		tag: string;
	}[];
	const subtasks = db
		.prepare('SELECT id, title, done FROM subtask WHERE task_id = ? ORDER BY position, id')
		.all(r.id) as { id: number; title: string; done: number }[];
	return {
		id: r.id,
		title: r.title,
		completedAt: r.completed_at,
		createdAt: r.created_at,
		projectId: r.project_id,
		tags: tags.map((t) => t.tag),
		subtasks: subtasks.map((s) => ({ id: s.id, title: s.title, done: s.done === 1 }))
	};
}

export function taskModule({ db, nowIso, atomically, record }: CoreContext): TaskApi {
	const getTask = (id: number) => readTask(db, id);

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
				const projectId = input.projectId ?? null;
				if (projectId !== null) assertProjectOpen(db, projectId);
				const { lastInsertRowid } = db
					.prepare('INSERT INTO task (title, created_at, project_id) VALUES (?, ?, ?)')
					.run(title, nowIso(), projectId);
				for (const tag of new Set((input.tags ?? []).map(cleanTag))) {
					db.prepare('INSERT INTO task_tag (task_id, tag) VALUES (?, ?)').run(
						Number(lastInsertRowid),
						tag
					);
				}
				const task = getTask(Number(lastInsertRowid));
				record(actor, 'task.create', 'task', task.id, null, task);
				return task;
			});
		},
		getTask,
		completeTask: (actor, id) => setCompletion(actor, id, true),
		uncompleteTask: (actor, id) => setCompletion(actor, id, false),
		listTasks(filter = {}) {
			const where: string[] = [];
			const args: (string | number)[] = [];
			if (filter.projectId === null) where.push('project_id IS NULL');
			else if (filter.projectId !== undefined) {
				where.push('project_id = ?');
				args.push(filter.projectId);
			}
			if (filter.tag !== undefined) {
				where.push('id IN (SELECT task_id FROM task_tag WHERE tag = ?)');
				args.push(filter.tag);
			}
			const sql = `SELECT * FROM task ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY id`;
			return (db.prepare(sql).all(...args) as unknown as TaskRow[]).map((r) => toTask(db, r));
		}
	};
}
