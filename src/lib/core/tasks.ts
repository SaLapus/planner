import type { Actor, CoreContext } from './context.js';

export interface Task {
	id: number;
	title: string;
	/** UTC instant (ISO 8601) or null while open. */
	completedAt: string | null;
	createdAt: string;
}

export interface TaskApi {
	createTask(actor: Actor, input: { title: string }): Task;
	completeTask(actor: Actor, id: number): Task;
	uncompleteTask(actor: Actor, id: number): Task;
	listTasks(): Task[];
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

export function taskModule({ db, nowIso, atomically, record, entities }: CoreContext): TaskApi {
	function getTask(id: number): Task {
		const row = db.prepare('SELECT * FROM task WHERE id = ?').get(id) as TaskRow | undefined;
		if (!row) throw new Error(`Task ${id} not found`);
		return toTask(row);
	}

	// Makes Tasks trashable and undoable (see "How to make a new entity trashable/undoable" in README).
	entities.register<Task>({
		type: 'task',
		read: (id) => {
			const row = db.prepare('SELECT * FROM task WHERE id = ?').get(id) as TaskRow | undefined;
			return row ? toTask(row) : null;
		},
		write: (t) => {
			db.prepare(
				'INSERT OR REPLACE INTO task (id, title, completed_at, created_at) VALUES (?, ?, ?, ?)'
			).run(t.id, t.title, t.completedAt, t.createdAt);
		},
		remove: (id) => {
			db.prepare('DELETE FROM task WHERE id = ?').run(id);
		},
		label: (t) => t.title
	});

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
		}
	};
}
