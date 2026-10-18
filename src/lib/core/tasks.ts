import type { Actor, CoreContext } from './context.js';

export const PRIORITIES = ['none', 'low', 'medium', 'high'] as const;
export type Priority = (typeof PRIORITIES)[number];
export type TaskList = 'today' | 'upcoming' | 'overdue' | 'inbox';

/**
 * Due input as ISO text: `2026-03-30` (local Home date), `2026-03-30T10:00` (Home wall-clock),
 * or with `Z` / an offset (converted to the Home zone). `null` clears the due date.
 */
export type DueInput = string | null;

export interface Task {
	id: number;
	title: string;
	/** UTC instant (ISO 8601) or null while open. */
	completedAt: string | null;
	createdAt: string;
	/** Local calendar date in the Home time zone (YYYY-MM-DD), or null. */
	dueDate: string | null;
	/** Home-zone wall-clock time (HH:MM); only set together with dueDate. */
	dueTime: string | null;
	priority: Priority;
}

export interface TaskApi {
	createTask(actor: Actor, input: { title: string; due?: DueInput; priority?: Priority }): Task;
	updateTask(
		actor: Actor,
		id: number,
		changes: { title?: string; due?: DueInput; priority?: Priority }
	): Task;
	completeTask(actor: Actor, id: number): Task;
	uncompleteTask(actor: Actor, id: number): Task;
	listTasks(): Task[];
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
}

const toTask = (r: TaskRow): Task => ({
	id: r.id,
	title: r.title,
	completedAt: r.completed_at,
	createdAt: r.created_at,
	dueDate: r.due_date,
	dueTime: r.due_time,
	priority: r.priority
});

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
	homeTimeZone
}: CoreContext): TaskApi {
	function getTask(id: number): Task {
		const row = db.prepare('SELECT * FROM task WHERE id = ?').get(id) as TaskRow | undefined;
		if (!row) throw new Error(`Task ${id} not found`);
		return toTask(row);
	}

	const allTasks = () =>
		(db.prepare('SELECT * FROM task ORDER BY id').all() as unknown as TaskRow[]).map(toTask);

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
			return atomically(() => {
				const { lastInsertRowid } = db
					.prepare(
						'INSERT INTO task (title, created_at, due_date, due_time, priority) VALUES (?, ?, ?, ?, ?)'
					)
					.run(title, nowIso(), due?.date ?? null, due?.time ?? null, priority);
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
				db.prepare(
					'UPDATE task SET title = ?, due_date = ?, due_time = ?, priority = ? WHERE id = ?'
				).run(title, dueDate, dueTime, priority, id);
				const after = getTask(id);
				record(actor, 'task.update', 'task', id, before, after);
				return after;
			});
		},
		completeTask: (actor, id) => setCompletion(actor, id, true),
		uncompleteTask: (actor, id) => setCompletion(actor, id, false),
		listTasks: allTasks,
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
