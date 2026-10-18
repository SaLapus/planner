import type { DatabaseSync } from 'node:sqlite';
import type { Actor, CoreContext } from './context.js';
import { assertProjectOpen, cleanTag } from './organising.js';

export const PRIORITIES = ['none', 'low', 'medium', 'high'] as const;
export type Priority = (typeof PRIORITIES)[number];
export type TaskList = 'today' | 'upcoming' | 'overdue' | 'inbox';

/**
 * Due input as ISO text: `2026-03-30` (local Home date), `2026-03-30T10:00` (Home wall-clock),
 * or with `Z` / an offset (converted to the Home zone). `null` clears the due date.
 */
export type DueInput = string | null;

/** Optional Time block: the Task is planned to occupy [start, start + minutes). */
export interface TimeBlock {
	/** UTC instant, e.g. "2026-03-30T07:00:00Z". */
	start: string;
	minutes: number;
}

/**
 * Time block input: `start` is a datetime, either Home wall-clock ("2026-03-30T10:00") or with
 * Z/offset; `minutes` is a whole number of minutes, 1..1440. `null` clears the block.
 */
export type TimeBlockInput = { start: string; minutes: number } | null;

export interface Task {
	id: number;
	title: string;
	/** UTC instant (ISO 8601) or null while open. */
	completedAt: string | null;
	createdAt: string;
	dueDate: string | null;
	/** Home-zone wall-clock time (HH:MM); only set together with dueDate. */
	dueTime: string | null;
	priority: Priority;
	/** Planned slot in the day (0..1). Independent of the due date. */
	timeBlock: TimeBlock | null;
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
		input: {
			title: string;
			due?: DueInput;
			priority?: Priority;
			timeBlock?: TimeBlockInput;
			projectId?: number | null;
			tags?: string[];
		}
	): Task;
	updateTask(
		actor: Actor,
		id: number,
		changes: { title?: string; due?: DueInput; priority?: Priority; timeBlock?: TimeBlockInput }
	): Task;
	getTask(id: number): Task;
	completeTask(actor: Actor, id: number): Task;
	uncompleteTask(actor: Actor, id: number): Task;
	listTasks(filter?: TaskFilter): Task[];
	/**
	 * Open Tasks in a smart list, "now" taken from the Clock in the Home time zone, ordered by
	 * due date, due time (date-only last), then priority (high first).
	 * overdue: due date passed, or due time passed today. today: due today and not yet overdue.
	 * upcoming: due after today. inbox: no due date (ordered by priority, then creation).
	 */
	tasksIn(list: TaskList): Task[];
	/** Case-insensitive title search over all Tasks (done ones included), oldest first. */
	searchTasks(text: string): Task[];
}

interface TaskRow {
	id: number;
	title: string;
	completed_at: string | null;
	created_at: string;
	due_date: string | null;
	due_time: string | null;
	priority: Priority;
	project_id: number | null;
	block_start: string | null;
	block_minutes: number | null;
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
		dueDate: r.due_date,
		dueTime: r.due_time,
		priority: r.priority,
		timeBlock: r.block_start === null ? null : { start: r.block_start, minutes: r.block_minutes! },
		projectId: r.project_id,
		tags: tags.map((t) => t.tag),
		subtasks: subtasks.map((s) => ({ id: s.id, title: s.title, done: s.done === 1 }))
	};
}

/** Validates a Time block and normalises its start to a UTC instant. Native Temporal. */
function parseTimeBlock(input: { start: string; minutes: number }, homeTimeZone: string): TimeBlock {
	const bad = () =>
		new Error(
			`Invalid time block (start "${input.start}", ${input.minutes} min): use a datetime like 2026-03-30T10:00 and 1..1440 whole minutes`
		);
	if (!Number.isInteger(input.minutes) || input.minutes < 1 || input.minutes > 1440) throw bad();
	const s = input.start.trim();
	if (!/^\d{4}-\d{2}-\d{2}T/.test(s)) throw bad();
	try {
		const instant = /(Z|[+-]\d{2}(:?\d{2})?)$/i.test(s)
			? Temporal.Instant.from(s)
			: Temporal.PlainDateTime.from(s, { overflow: 'reject' })
					.toZonedDateTime(homeTimeZone)
					.toInstant();
		return { start: instant.toString(), minutes: input.minutes };
	} catch {
		throw bad();
	}
}

const PRIORITY_RANK: Record<Priority, number> = { none: 0, low: 1, medium: 2, high: 3 };

function checkPriority(p: string): Priority {
	if (!(PRIORITIES as readonly string[]).includes(p)) {
		throw new Error(`Invalid priority "${p}" (use none, low, medium or high)`);
	}
	return p as Priority;
}

/** Turns ISO due text into Home-zone parts. Native Temporal; never reads the system time zone. */
function parseDue(text: string, homeTimeZone: string): { date: string; time: string | null } {
	const bad = () =>
		new Error(`Invalid due "${text}" (use YYYY-MM-DD or YYYY-MM-DDTHH:MM, optional Z/offset)`);
	const s = text.trim();
	try {
		if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
			return { date: Temporal.PlainDate.from(s, { overflow: 'reject' }).toString(), time: null };
		}
		if (!/^\d{4}-\d{2}-\d{2}T/.test(s)) throw bad();
		const local = /(Z|[+-]\d{2}(:?\d{2})?)$/i.test(s)
			? Temporal.Instant.from(s).toZonedDateTimeISO(homeTimeZone).toPlainDateTime()
			: Temporal.PlainDateTime.from(s, { overflow: 'reject' });
		return {
			date: local.toPlainDate().toString(),
			time: local.toPlainTime().toString({ smallestUnit: 'minute' })
		};
	} catch {
		throw bad();
	}
}

export function taskModule({
	db,
	nowIso,
	atomically,
	record,
	clock,
	homeTimeZone,
	entities
}: CoreContext): TaskApi {
	const getTask = (id: number) => readTask(db, id);

	// Makes Tasks trashable and undoable (see "How to make a new entity trashable/undoable" in README).
	// The snapshot is the full Task: columns plus the tag and subtask rows it owns.
	entities.register<Task>({
		type: 'task',
		read: (id) => {
			const row = db.prepare('SELECT * FROM task WHERE id = ?').get(id) as TaskRow | undefined;
			return row ? toTask(db, row) : null;
		},
		write: (t) => {
			if (
				t.projectId !== null &&
				!db.prepare('SELECT 1 FROM project WHERE id = ?').get(t.projectId)
			) {
				throw new Error(`its project ${t.projectId} is in Trash or gone; restore the project first`);
			}
			db.prepare(
				`INSERT OR REPLACE INTO task
				 (id, title, completed_at, created_at, due_date, due_time, priority, project_id, block_start, block_minutes)
				 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
			).run(
				t.id,
				t.title,
				t.completedAt,
				t.createdAt,
				t.dueDate,
				t.dueTime,
				t.priority,
				t.projectId,
				t.timeBlock?.start ?? null,
				t.timeBlock?.minutes ?? null
			);
			db.prepare('DELETE FROM task_tag WHERE task_id = ?').run(t.id);
			db.prepare('DELETE FROM subtask WHERE task_id = ?').run(t.id);
			t.tags.forEach((tag) =>
				db.prepare('INSERT INTO task_tag (task_id, tag) VALUES (?, ?)').run(t.id, tag)
			);
			t.subtasks.forEach((s, i) =>
				db
					.prepare('INSERT INTO subtask (id, task_id, title, done, position) VALUES (?, ?, ?, ?, ?)')
					.run(s.id, t.id, s.title, s.done ? 1 : 0, i)
			);
		},
		remove: (id) => {
			db.prepare('DELETE FROM task_tag WHERE task_id = ?').run(id);
			db.prepare('DELETE FROM subtask WHERE task_id = ?').run(id);
			db.prepare('DELETE FROM task WHERE id = ?').run(id);
		},
		label: (t) => t.title
	});

	const allTasks = () =>
		(db.prepare('SELECT * FROM task ORDER BY id').all() as unknown as TaskRow[]).map((r) => toTask(db, r));

	/** Due date, then timed before date-only, then priority (high first), then id. */
	function byDue(a: Task, b: Task): number {
		return (
			(a.dueDate ?? '').localeCompare(b.dueDate ?? '') ||
			(a.dueTime ?? '99:99').localeCompare(b.dueTime ?? '99:99') ||
			PRIORITY_RANK[b.priority] - PRIORITY_RANK[a.priority] ||
			a.id - b.id
		);
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
			const due = input.due ? parseDue(input.due, homeTimeZone) : null;
			const priority = checkPriority(input.priority ?? 'none');
			const block = input.timeBlock ? parseTimeBlock(input.timeBlock, homeTimeZone) : null;
			return atomically(() => {
				const projectId = input.projectId ?? null;
				if (projectId !== null) assertProjectOpen(db, projectId);
				const { lastInsertRowid } = db
					.prepare(
						'INSERT INTO task (title, created_at, due_date, due_time, priority, project_id, block_start, block_minutes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
					)
					.run(
						title,
						nowIso(),
						due?.date ?? null,
						due?.time ?? null,
						priority,
						projectId,
						block?.start ?? null,
						block?.minutes ?? null
					);
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
		updateTask(actor, id, changes) {
			return atomically(() => {
				const before = getTask(id);
				const title = changes.title === undefined ? before.title : changes.title.trim();
				if (!title) throw new Error('Task title must not be empty');
				let { dueDate, dueTime } = before;
				if (changes.due !== undefined) {
					const due = changes.due ? parseDue(changes.due, homeTimeZone) : null;
					dueDate = due?.date ?? null;
					dueTime = due?.time ?? null;
				}
				const priority = checkPriority(changes.priority ?? before.priority);
				const block =
					changes.timeBlock === undefined
						? before.timeBlock
						: changes.timeBlock && parseTimeBlock(changes.timeBlock, homeTimeZone);
				db.prepare(
					'UPDATE task SET title = ?, due_date = ?, due_time = ?, priority = ?, block_start = ?, block_minutes = ? WHERE id = ?'
				).run(title, dueDate, dueTime, priority, block?.start ?? null, block?.minutes ?? null, id);
				const after = getTask(id);
				record(actor, 'task.update', 'task', id, before, after);
				return after;
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
		},
		tasksIn(list) {
			const open = allTasks().filter((t) => t.completedAt === null);
			if (list === 'inbox') {
				return open
					.filter((t) => t.dueDate === null)
					.sort((a, b) => PRIORITY_RANK[b.priority] - PRIORITY_RANK[a.priority] || a.id - b.id);
			}
			const local = Temporal.Instant.fromEpochMilliseconds(clock.now().getTime())
				.toZonedDateTimeISO(homeTimeZone)
				.toPlainDateTime();
			const today = local.toPlainDate().toString();
			const time = local.toPlainTime().toString({ smallestUnit: 'minute' });
			const isOverdue = (t: Task) =>
				t.dueDate! < today || (t.dueDate === today && t.dueTime !== null && t.dueTime < time);
			const matches: Record<Exclude<TaskList, 'inbox'>, (t: Task) => boolean> = {
				overdue: isOverdue,
				today: (t) => t.dueDate === today && !isOverdue(t),
				upcoming: (t) => t.dueDate! > today
			};
			return open
				.filter((t) => t.dueDate !== null)
				.filter(matches[list])
				.sort(byDue);
		},
		searchTasks(text) {
			const needle = text.trim().toLowerCase();
			if (!needle) return [];
			return allTasks().filter((t) => t.title.toLowerCase().includes(needle));
		}
	};
}
