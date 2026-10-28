import type { DatabaseSync } from 'node:sqlite';
import type { Actor, CoreContext } from './context.js';
import { clampToDue, defaultStartDate, resolveStartDate } from './start-date.js';
import { assertProjectOpen, cleanTag } from './organising.js';
import { normalizeRule, occurrencesBetween, ruleContinuingFrom, type RuleSpec } from './recurrence.js';

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

export const REPEAT_UNITS = ['day', 'week', 'month', 'year'] as const;
export type RepeatUnit = (typeof REPEAT_UNITS)[number];

/**
 * How a Task repeats. `fixed`: an RRULE anchored at the Task's due date (e.g. every Monday).
 * `after`: `every` units after the day it was completed (e.g. 3 days after I last did it).
 */
export type Repeat =
	| { type: 'fixed'; rrule: string }
	| { type: 'after'; every: number; unit: RepeatUnit };

export interface Task {
	id: number;
	title: string;
	/** UTC instant (ISO 8601) or null while open. */
	completedAt: string | null;
	createdAt: string;
	dueDate: string | null;
	/** Home-zone wall-clock time (HH:MM); only set together with dueDate. */
	dueTime: string | null;
	/** The day the Task becomes relevant (Home-zone date). Never blank. See `defaultStartDate`. */
	startDate: string;
	priority: Priority;
	/** Free text to read (book, links, a bookmark); empty means no Notes. Subtasks are for tickable steps. */
	notes: string;
	/** Planned slot in the day (0..1). Independent of the due date. */
	timeBlock: TimeBlock | null;
	/** Project this Task belongs to (0..1). Managed by organising.ts. */
	projectId: number | null;
	/** Free-form tags, sorted. Managed by organising.ts. */
	tags: string[];
	/** One-level checklist, in order. Managed by organising.ts. */
	subtasks: Subtask[];
	/** Milestone this Task moves forward (0..1). Managed by goals.ts; dormant while the Milestone is in Trash. */
	milestoneId: number | null;
	/** How the Task repeats; completing it then creates the next instance. */
	repeat: Repeat | null;
	/** The next instance created when this one was completed (history link). Null if none yet or the series ended. */
	nextId: number | null;
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

/** What `searchTasks` can narrow by besides text: a Project, a Tag and a due-date range (inclusive local dates). */
export interface TaskSearchFilter extends TaskFilter {
	dueFrom?: string;
	dueTo?: string;
}

export interface TaskApi {
	createTask(
		actor: Actor,
		input: {
			title: string;
			due?: DueInput;
			/** Start date as `YYYY-MM-DD`; omitted or null means the default rule. Must not be after the due date. */
			start?: string | null;
			priority?: Priority;
			notes?: string;
			timeBlock?: TimeBlockInput;
			projectId?: number | null;
			tags?: string[];
			repeat?: Repeat | null;
			/** Subtask titles, created unticked in this order as part of the same creation. */
			subtasks?: string[];
		}
	): Task;
	updateTask(
		actor: Actor,
		id: number,
		changes: {
			title?: string;
			due?: DueInput;
			/**
			 * Start date as `YYYY-MM-DD`; `null` resets it to the default rule (creation day, or the due date if
			 * earlier). Changing only the due date to before the Start date pulls the Start date back to it.
			 */
			start?: string | null;
			priority?: Priority;
			/** Absent leaves the Notes unchanged; an empty string clears them. */
			notes?: string;
			timeBlock?: TimeBlockInput;
			repeat?: Repeat | null;
		}
	): Task;
	getTask(id: number): Task;
	/**
	 * Completes a Task. A repeating Task also gets its next instance (linked as `nextId`; part of the one
	 * `task.complete` entry, whose after-snapshot carries `nextId`): due date from the rule (fixed: the first occurrence after both the
	 * due date and today) or from today (after-completion). Un-completing, or undoing the completion,
	 * removes that next instance again, and refuses if it was already changed or completed.
	 */
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
	/**
	 * The "Все" view, narrowed like `listTasks`. Open Tasks whose Start date is today (Home zone) or
	 * earlier are `active`; later ones are `notStarted`. Both: due date ascending, timed before date-only,
	 * priority (high first), creation order; Tasks without a due date LAST. `completed`: newest completion first.
	 */
	tasksSplit(filter?: TaskFilter): { active: Task[]; notStarted: Task[]; completed: Task[] };
	/**
	 * Case-insensitive search of title and Notes over all Tasks (done ones included), oldest first, optionally narrowed by
	 * Project, Tag and a due-date range (`dueFrom`/`dueTo`, inclusive "YYYY-MM-DD"; Tasks without a due date
	 * never match a date bound). Empty text matches every title, but with no text and no filter nothing is returned.
	 */
	searchTasks(text: string, filter?: TaskSearchFilter): Task[];
}

interface TaskRow {
	id: number;
	title: string;
	completed_at: string | null;
	created_at: string;
	due_date: string | null;
	due_time: string | null;
	start_date: string;
	priority: Priority;
	notes: string;
	project_id: number | null;
	block_start: string | null;
	block_minutes: number | null;
	milestone_id: number | null;
	repeat: string | null;
	next_id: number | null;
}

/** The Subtask title rule, shared by adding one Subtask and creating a Task with a list. */
export function cleanSubtaskTitle(title: string): string {
	const t = title.trim();
	if (!t) throw new Error('Subtask title must not be empty');
	return t;
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
		startDate: r.start_date,
		priority: r.priority,
		notes: r.notes,
		timeBlock: r.block_start === null ? null : { start: r.block_start, minutes: r.block_minutes! },
		projectId: r.project_id,
		tags: tags.map((t) => t.tag),
		subtasks: subtasks.map((s) => ({ id: s.id, title: s.title, done: s.done === 1 })),
		milestoneId: r.milestone_id,
		repeat: r.repeat === null ? null : (JSON.parse(r.repeat) as Repeat),
		nextId: r.next_id
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

/** Validates a repetition input; `fixed` needs a due date to anchor on. */
function parseRepeat(input: Repeat | null | undefined, hasDue: boolean): Repeat | null {
	if (!input) return null;
	if (input.type === 'fixed') {
		if (!hasDue) throw new Error('A fixed repetition needs a due date to start from');
		return { type: 'fixed', rrule: normalizeRule(input.rrule) };
	}
	if (input.type === 'after') {
		if (!Number.isInteger(input.every) || input.every < 1 || input.every > 999) {
			throw new Error(`Invalid repetition: every must be a whole number 1..999 (got ${input.every})`);
		}
		if (!(REPEAT_UNITS as readonly string[]).includes(input.unit)) {
			throw new Error(`Invalid repetition unit "${input.unit}" (use day, week, month or year)`);
		}
		return { type: 'after', every: input.every, unit: input.unit };
	}
	throw new Error('Invalid repetition type (use "fixed" or "after")');
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
			const previousNext = (
				db.prepare('SELECT next_id FROM task WHERE id = ?').get(t.id) as
					| { next_id: number | null }
					| undefined
			)?.next_id;
			db.prepare(
				`INSERT OR REPLACE INTO task
				 (id, title, completed_at, created_at, due_date, due_time, start_date, priority, notes, project_id, block_start, block_minutes, milestone_id, repeat, next_id)
				 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
			).run(
				t.id,
				t.title,
				t.completedAt,
				t.createdAt,
				t.dueDate,
				t.dueTime,
				// Snapshots from before the Start date existed have none: apply the default rule.
				t.startDate ?? defaultStartDate(t.createdAt, t.dueDate, homeTimeZone),
				t.priority,
				// Snapshots from before Notes existed have none.
				t.notes ?? '',
				t.projectId,
				t.timeBlock?.start ?? null,
				t.timeBlock?.minutes ?? null,
				t.milestoneId,
				t.repeat === null ? null : JSON.stringify(t.repeat),
				t.nextId
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
			// The completed Task and its next instance go together: reverting a completion
			// (undo, restore of an older snapshot) drops the next instance; re-applying it brings it back.
			if (previousNext != null && previousNext !== t.nextId) dropNextInstance(previousNext);
			if (t.nextId !== null && t.completedAt !== null && !taskExists(t.nextId) && !inTrash(t.nextId)) {
				const next = nextInstanceOf(t);
				if (next) insertNextInstance(t, next, t.nextId);
			}
		},
		remove: (id) => {
			db.prepare('DELETE FROM task_tag WHERE task_id = ?').run(id);
			db.prepare('DELETE FROM subtask WHERE task_id = ?').run(id);
			db.prepare('DELETE FROM task WHERE id = ?').run(id);
		},
		label: (t) => t.title
	});

	const taskExists = (id: number) => db.prepare('SELECT 1 FROM task WHERE id = ?').get(id) !== undefined;
	const inTrash = (id: number) =>
		db.prepare("SELECT 1 FROM trash WHERE entity_type = 'task' AND entity_id = ?").get(id) !== undefined;

	/** Home-zone calendar date of an instant (default: now). */
	const homeDate = (iso = nowIso()) =>
		Temporal.Instant.from(iso).toZonedDateTimeISO(homeTimeZone).toPlainDate();

	/** Due date/time and repetition of the instance that follows `t` (completed at `t.completedAt`), or null if the series ended. */
	function nextInstanceOf(t: Task): { dueDate: string | null; dueTime: string | null; repeat: Repeat } | null {
		const repeat = t.repeat;
		if (!repeat) return null;
		const completedOn = homeDate(t.completedAt!);
		if (repeat.type === 'after') {
			const dueDate = completedOn.add({ [`${repeat.unit}s`]: repeat.every }).toString();
			return { dueDate, dueTime: t.dueTime, repeat };
		}
		if (t.dueDate === null) return null;
		const spec: RuleSpec = {
			rrule: repeat.rrule,
			startLocal: `${t.dueDate}T${t.dueTime ?? '00:00'}`,
			timeZone: homeTimeZone
		};
		const due = Temporal.PlainDate.from(t.dueDate);
		const floor = Temporal.PlainDate.compare(due, completedOn) > 0 ? due : completedOn;
		let from = floor.add({ days: 1 });
		for (let year = 0; year < 12; year++) {
			const to = from.add({ years: 1 });
			const hit = occurrencesBetween(
				spec,
				from.toZonedDateTime(homeTimeZone).epochMilliseconds,
				to.toZonedDateTime(homeTimeZone).epochMilliseconds
			)[0];
			if (hit) {
				const rule = ruleContinuingFrom(spec, hit.recurrenceId);
				if (rule === null) return null;
				return {
					dueDate: hit.start.toPlainDate().toString(),
					dueTime: t.dueTime === null ? null : hit.recurrenceId.slice(11),
					repeat: { type: 'fixed', rrule: rule }
				};
			}
			from = to;
		}
		return null;
	}

	/** Creates the next instance of completed Task `t` (explicit `id` when re-creating it on redo). */
	function insertNextInstance(
		t: Task,
		next: { dueDate: string | null; dueTime: string | null; repeat: Repeat },
		id?: number
	): Task {
		let timeBlock: TimeBlock | null = null;
		if (t.timeBlock && next.dueDate) {
			const start = Temporal.Instant.from(t.timeBlock.start).toZonedDateTimeISO(homeTimeZone);
			const base = t.dueDate ? Temporal.PlainDate.from(t.dueDate) : start.toPlainDate();
			const days = base.until(Temporal.PlainDate.from(next.dueDate), { largestUnit: 'days' }).days;
			timeBlock = {
				start: start.add({ days }).toInstant().toString(),
				minutes: t.timeBlock.minutes
			};
		} else if (t.timeBlock) {
			timeBlock = t.timeBlock;
		}
		// Keep the gap between Start date and due date; with no due date, move by the repeat interval.
		const startOf = Temporal.PlainDate.from(t.startDate);
		let startDate: string;
		if (t.dueDate && next.dueDate) {
			const gap = startOf.until(Temporal.PlainDate.from(t.dueDate), { largestUnit: 'days' }).days;
			startDate = Temporal.PlainDate.from(next.dueDate).subtract({ days: Math.max(gap, 0) }).toString();
		} else {
			// No due date on one side, so this is an "after" repeat (a fixed one always has both dates).
			const { every, unit } = next.repeat as Extract<Repeat, { type: 'after' }>;
			startDate = clampToDue(startOf.add({ [`${unit}s`]: every }).toString(), next.dueDate);
		}
		const { lastInsertRowid } = db
			.prepare(
				`INSERT INTO task (id, title, created_at, due_date, due_time, start_date, priority, notes, project_id, block_start, block_minutes, milestone_id, repeat)
				 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
			)
			.run(
				id ?? null,
				t.title,
				nowIso(),
				next.dueDate,
				next.dueTime,
				startDate,
				t.priority,
				t.notes,
				t.projectId,
				timeBlock?.start ?? null,
				timeBlock?.minutes ?? null,
				t.milestoneId,
				JSON.stringify(next.repeat)
			);
		const newId = Number(lastInsertRowid);
		for (const tag of t.tags) {
			db.prepare('INSERT INTO task_tag (task_id, tag) VALUES (?, ?)').run(newId, tag);
		}
		t.subtasks.forEach((s, i) =>
			db
				.prepare('INSERT INTO subtask (task_id, title, done, position) VALUES (?, ?, 0, ?)')
				.run(newId, s.title, i)
		);
		return getTask(newId);
	}

	/**
	 * Takes a still-untouched next instance away again. Refuses if it was completed or changed since
	 * it was created (then the series has moved on and reverting would lose work).
	 */
	function dropNextInstance(id: number) {
		if (!taskExists(id)) {
			// Already deleted by hand: make sure restoring it later cannot produce a duplicate.
			db.prepare("DELETE FROM trash WHERE entity_type = 'task' AND entity_id = ?").run(id);
			return;
		}
		const touched = db
			.prepare(
				"SELECT 1 FROM change_log WHERE entity_type = 'task' AND entity_id = ? AND action <> 'task.create'"
			)
			.get(id);
		if (touched || getTask(id).completedAt !== null) {
			throw new Error(`the next instance (task #${id}) was already changed or completed; deal with it first`);
		}
		db.prepare('DELETE FROM task_tag WHERE task_id = ?').run(id);
		db.prepare('DELETE FROM subtask WHERE task_id = ?').run(id);
		db.prepare('DELETE FROM task WHERE id = ?').run(id);
	}

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
			let nextId: number | null = null;
			if (complete) {
				const done = { ...before, completedAt: nowIso() };
				const next = nextInstanceOf(done);
				if (next) {
					nextId = insertNextInstance(done, next).id;
				}
			} else if (before.nextId !== null) {
				dropNextInstance(before.nextId);
			}
			db.prepare('UPDATE task SET completed_at = ?, next_id = ? WHERE id = ?').run(
				complete ? nowIso() : null,
				nextId,
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
			const repeat = parseRepeat(input.repeat, due !== null);
			const subtasks = (input.subtasks ?? []).map(cleanSubtaskTitle);
			const created = nowIso();
			const startDate = resolveStartDate(
				due?.date ?? null,
				homeTimeZone,
				input.start == null ? { createdAt: created } : { explicit: input.start }
			);
			return atomically(() => {
				const projectId = input.projectId ?? null;
				if (projectId !== null) assertProjectOpen(db, projectId);
				const { lastInsertRowid } = db
					.prepare(
						'INSERT INTO task (title, created_at, due_date, due_time, start_date, priority, notes, project_id, block_start, block_minutes, repeat) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
					)
					.run(
						title,
						created,
						due?.date ?? null,
						due?.time ?? null,
						startDate,
						priority,
						input.notes ?? '',
						projectId,
						block?.start ?? null,
						block?.minutes ?? null,
						repeat === null ? null : JSON.stringify(repeat)
					);
				for (const tag of new Set((input.tags ?? []).map(cleanTag))) {
					db.prepare('INSERT INTO task_tag (task_id, tag) VALUES (?, ?)').run(
						Number(lastInsertRowid),
						tag
					);
				}
				subtasks.forEach((title, position) =>
					db
						.prepare('INSERT INTO subtask (task_id, title, position) VALUES (?, ?, ?)')
						.run(Number(lastInsertRowid), title, position)
				);
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
				const startDate = resolveStartDate(
					dueDate,
					homeTimeZone,
					changes.start === null
						? { createdAt: before.createdAt }
						: changes.start === undefined
							? { keep: before.startDate }
							: { explicit: changes.start }
				);
				const priority = checkPriority(changes.priority ?? before.priority);
				const block =
					changes.timeBlock === undefined
						? before.timeBlock
						: changes.timeBlock && parseTimeBlock(changes.timeBlock, homeTimeZone);
				const repeat = parseRepeat(
					changes.repeat === undefined ? before.repeat : changes.repeat,
					dueDate !== null
				);
				db.prepare(
					'UPDATE task SET title = ?, due_date = ?, due_time = ?, start_date = ?, priority = ?, notes = ?, block_start = ?, block_minutes = ?, repeat = ? WHERE id = ?'
				).run(
					title,
					dueDate,
					dueTime,
					startDate,
					priority,
					changes.notes ?? before.notes,
					block?.start ?? null,
					block?.minutes ?? null,
					repeat === null ? null : JSON.stringify(repeat),
					id
				);
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
		tasksSplit(filter = {}) {
			const today = homeDate().toString();
			const all = this.listTasks(filter);
			// Like `byDue`, but a Task without a due date goes last.
			const byDueUndatedLast = (a: Task, b: Task) =>
				Number(a.dueDate === null) - Number(b.dueDate === null) || byDue(a, b);
			const open = all.filter((t) => t.completedAt === null).sort(byDueUndatedLast);
			return {
				active: open.filter((t) => t.startDate <= today),
				notStarted: open.filter((t) => t.startDate > today),
				completed: all
					.filter((t) => t.completedAt !== null)
					.sort((a, b) => b.completedAt!.localeCompare(a.completedAt!) || b.id - a.id)
			};
		},
		searchTasks(text, filter = {}) {
			const needle = text.trim().toLowerCase();
			const checkDate = (d: string | undefined) => {
				if (d !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(d)) {
					throw new Error(`Invalid date "${d}" (expected YYYY-MM-DD)`);
				}
			};
			checkDate(filter.dueFrom);
			checkDate(filter.dueTo);
			const { dueFrom, dueTo, ...rest } = filter;
			const narrowed = Object.values(filter).some((v) => v !== undefined);
			if (!needle && !narrowed) return [];
			return this.listTasks(rest).filter(
				(t) =>
					(t.title.toLowerCase().includes(needle) || t.notes.toLowerCase().includes(needle)) &&
					(dueFrom === undefined || (t.dueDate !== null && t.dueDate >= dueFrom)) &&
					(dueTo === undefined || (t.dueDate !== null && t.dueDate <= dueTo))
			);
		}
	};
}
