/**
 * Organising Tasks: Projects (one level, archivable), free-form Tags and one-level Subtasks.
 *
 * Every change to a Task's project/tags/subtasks is logged as ONE `task.*` entry whose
 * before/after are full Task snapshots (so undo can restore them); Project changes log
 * full Project snapshots.
 */
import type { DatabaseSync } from 'node:sqlite';
import type { Actor, CoreContext } from './context.js';
import { readTask, type Task } from './tasks.js';

export interface Project {
	id: number;
	name: string;
	/** UTC instant when archived, or null while active. */
	archivedAt: string | null;
	createdAt: string;
}

export interface TagCount {
	tag: string;
	count: number;
}

export interface OrganisingApi {
	createProject(actor: Actor, input: { name: string }): Project;
	renameProject(actor: Actor, id: number, name: string): Project;
	archiveProject(actor: Actor, id: number): Project;
	unarchiveProject(actor: Actor, id: number): Project;
	/** Active projects only, unless `includeArchived`. */
	listProjects(opts?: { includeArchived?: boolean }): Project[];

	setTaskProject(actor: Actor, taskId: number, projectId: number | null): Task;

	addTag(actor: Actor, taskId: number, tag: string): Task;
	removeTag(actor: Actor, taskId: number, tag: string): Task;
	/** All tags in use with how many tasks carry each. */
	listTags(): TagCount[];

	addSubtask(actor: Actor, taskId: number, title: string): Task;
	setSubtaskDone(actor: Actor, taskId: number, subtaskId: number, done: boolean): Task;
	removeSubtask(actor: Actor, taskId: number, subtaskId: number): Task;
	/** `orderedIds` must list every subtask of the task exactly once. */
	reorderSubtasks(actor: Actor, taskId: number, orderedIds: number[]): Task;
}

interface ProjectRow {
	id: number;
	name: string;
	archived_at: string | null;
	created_at: string;
}

const toProject = (r: ProjectRow): Project => ({
	id: r.id,
	name: r.name,
	archivedAt: r.archived_at,
	createdAt: r.created_at
});

function readProject(db: DatabaseSync, id: number): Project {
	const row = db.prepare('SELECT * FROM project WHERE id = ?').get(id) as ProjectRow | undefined;
	if (!row) throw new Error(`Project ${id} not found`);
	return toProject(row);
}

/** Throws unless the project exists and is not archived. */
export function assertProjectOpen(db: DatabaseSync, id: number): void {
	if (readProject(db, id).archivedAt !== null) {
		throw new Error(`Project ${id} is archived`);
	}
}

export function cleanTag(tag: string): string {
	const t = tag.trim();
	if (!t) throw new Error('Tag must not be empty');
	return t;
}

export function organisingModule({ db, nowIso, atomically, record }: CoreContext): OrganisingApi {
	/** Runs `mutate` on a task and logs one entry with full before/after task snapshots. */
	function changeTask(actor: Actor, taskId: number, action: string, mutate: () => void): Task {
		return atomically(() => {
			const before = readTask(db, taskId);
			mutate();
			const after = readTask(db, taskId);
			record(actor, action, 'task', taskId, before, after);
			return after;
		});
	}

	function changeProject(
		actor: Actor,
		id: number,
		action: string,
		mutate: (before: Project) => void
	): Project {
		return atomically(() => {
			const before = readProject(db, id);
			mutate(before);
			const after = readProject(db, id);
			record(actor, action, 'project', id, before, after);
			return after;
		});
	}

	function cleanName(name: string): string {
		const n = name.trim();
		if (!n) throw new Error('Project name must not be empty');
		return n;
	}

	function cleanTitle(title: string): string {
		const t = title.trim();
		if (!t) throw new Error('Subtask title must not be empty');
		return t;
	}

	function subtaskIds(taskId: number): number[] {
		return (
			db
				.prepare('SELECT id FROM subtask WHERE task_id = ? ORDER BY position, id')
				.all(taskId) as { id: number }[]
		).map((r) => r.id);
	}

	function assertSubtask(taskId: number, subtaskId: number) {
		if (!subtaskIds(taskId).includes(subtaskId)) {
			throw new Error(`Subtask ${subtaskId} not found in task ${taskId}`);
		}
	}

	return {
		createProject(actor, input) {
			const name = cleanName(input.name);
			return atomically(() => {
				const { lastInsertRowid } = db
					.prepare('INSERT INTO project (name, created_at) VALUES (?, ?)')
					.run(name, nowIso());
				const project = readProject(db, Number(lastInsertRowid));
				record(actor, 'project.create', 'project', project.id, null, project);
				return project;
			});
		},
		renameProject(actor, id, name) {
			const n = cleanName(name);
			return changeProject(actor, id, 'project.rename', () => {
				db.prepare('UPDATE project SET name = ? WHERE id = ?').run(n, id);
			});
		},
		archiveProject(actor, id) {
			return changeProject(actor, id, 'project.archive', (before) => {
				if (before.archivedAt !== null) throw new Error(`Project ${id} is already archived`);
				db.prepare('UPDATE project SET archived_at = ? WHERE id = ?').run(nowIso(), id);
			});
		},
		unarchiveProject(actor, id) {
			return changeProject(actor, id, 'project.unarchive', (before) => {
				if (before.archivedAt === null) throw new Error(`Project ${id} is not archived`);
				db.prepare('UPDATE project SET archived_at = NULL WHERE id = ?').run(id);
			});
		},
		listProjects({ includeArchived = false } = {}) {
			const sql = `SELECT * FROM project ${includeArchived ? '' : 'WHERE archived_at IS NULL'} ORDER BY id`;
			return (db.prepare(sql).all() as unknown as ProjectRow[]).map(toProject);
		},

		setTaskProject(actor, taskId, projectId) {
			return changeTask(actor, taskId, 'task.set_project', () => {
				if (projectId !== null) assertProjectOpen(db, projectId);
				db.prepare('UPDATE task SET project_id = ? WHERE id = ?').run(projectId, taskId);
			});
		},

		addTag(actor, taskId, tag) {
			const t = cleanTag(tag);
			return changeTask(actor, taskId, 'task.add_tag', () => {
				if (readTask(db, taskId).tags.includes(t)) {
					throw new Error(`Task ${taskId} already has tag "${t}"`);
				}
				db.prepare('INSERT INTO task_tag (task_id, tag) VALUES (?, ?)').run(taskId, t);
			});
		},
		removeTag(actor, taskId, tag) {
			const t = cleanTag(tag);
			return changeTask(actor, taskId, 'task.remove_tag', () => {
				if (!readTask(db, taskId).tags.includes(t)) {
					throw new Error(`Task ${taskId} has no tag "${t}"`);
				}
				db.prepare('DELETE FROM task_tag WHERE task_id = ? AND tag = ?').run(taskId, t);
			});
		},
		listTags() {
			return db
				.prepare('SELECT tag, COUNT(*) AS count FROM task_tag GROUP BY tag ORDER BY tag')
				.all() as unknown as TagCount[];
		},

		addSubtask(actor, taskId, title) {
			const t = cleanTitle(title);
			return changeTask(actor, taskId, 'task.add_subtask', () => {
				db.prepare('INSERT INTO subtask (task_id, title, position) VALUES (?, ?, ?)').run(
					taskId,
					t,
					subtaskIds(taskId).length
				);
			});
		},
		setSubtaskDone(actor, taskId, subtaskId, done) {
			return changeTask(actor, taskId, done ? 'task.check_subtask' : 'task.uncheck_subtask', () => {
				assertSubtask(taskId, subtaskId);
				const current = readTask(db, taskId).subtasks.find((s) => s.id === subtaskId)!.done;
				if (current === done) {
					throw new Error(`Subtask ${subtaskId} is already ${done ? 'checked' : 'unchecked'}`);
				}
				db.prepare('UPDATE subtask SET done = ? WHERE id = ?').run(done ? 1 : 0, subtaskId);
			});
		},
		removeSubtask(actor, taskId, subtaskId) {
			return changeTask(actor, taskId, 'task.remove_subtask', () => {
				assertSubtask(taskId, subtaskId);
				db.prepare('DELETE FROM subtask WHERE id = ?').run(subtaskId);
			});
		},
		reorderSubtasks(actor, taskId, orderedIds) {
			return changeTask(actor, taskId, 'task.reorder_subtasks', () => {
				const existing = subtaskIds(taskId);
				const same =
					orderedIds.length === existing.length &&
					new Set(orderedIds).size === existing.length &&
					orderedIds.every((id) => existing.includes(id));
				if (!same) throw new Error('Reorder must list every subtask of the task exactly once');
				orderedIds.forEach((id, i) =>
					db.prepare('UPDATE subtask SET position = ? WHERE id = ?').run(i, id)
				);
			});
		}
	};
}
