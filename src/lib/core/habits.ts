/**
 * Habits, Check-ins, Periods and Streaks.
 *
 * Words (see the spec): a Check-in is "done on this local date" (Home time zone), at most one per
 * Habit per date. A Period is an ISO week (Monday start) for per-week / weekday Habits, or a
 * calendar month for per-month Habits. A Period is *met* when the target is reached. A Streak is the
 * number of consecutive met Periods ending at the last closed Period, plus the current one if it is
 * already met; the open Period never breaks a Streak.
 *
 * Deleting a Habit or removing a Check-in is soft (`deleted_at`), so Trash/undo can bring it back.
 */
import type { Actor, CoreContext } from './context.js';

export type HabitSchedule =
	| { type: 'per_week'; count: number }
	| { type: 'per_month'; count: number }
	/** `days` are ISO weekdays: 1 = Monday ... 7 = Sunday. */
	| { type: 'weekdays'; days: number[] };

export interface Habit {
	id: number;
	title: string;
	schedule: HabitSchedule;
	/** UTC instant, or null while the Habit is active. */
	archivedAt: string | null;
	createdAt: string;
}

export interface Checkin {
	id: number;
	habitId: number;
	/** Local date (YYYY-MM-DD) in the Home time zone. */
	date: string;
}

export type PeriodType = 'week' | 'month';

export interface HabitStatus {
	habit: Habit;
	period: { type: PeriodType; /** first local date */ start: string; /** last local date, inclusive */ end: string };
	/** Check-ins counted in this period (for weekday Habits: only on scheduled weekdays). */
	done: number;
	target: number;
	met: boolean;
	/** Whether the period still contains today (an open period never breaks a streak). */
	open: boolean;
	streak: number;
	/** Local dates checked in this period (all of them, sorted). */
	checkins: string[];
	/** Is today (for `date` omitted) already checked? Only meaningful for the current period. */
	checkedToday: boolean;
}

export interface HabitStatusResult {
	/** The local date the status is relative to (today unless `date` was given). */
	date: string;
	habits: HabitStatus[];
}

export interface HabitApi {
	createHabit(actor: Actor, input: { title: string; schedule: HabitSchedule }): Habit;
	updateHabit(actor: Actor, id: number, patch: { title?: string; schedule?: HabitSchedule }): Habit;
	archiveHabit(actor: Actor, id: number): Habit;
	unarchiveHabit(actor: Actor, id: number): Habit;
	/** Soft delete: the Habit and its Check-ins go to the Trash. */
	deleteHabit(actor: Actor, id: number): Habit;
	restoreHabit(actor: Actor, id: number): Habit;
	listHabits(opts?: { includeArchived?: boolean }): Habit[];
	listDeletedHabits(): Habit[];

	/** `date` is a local date, or an instant (ISO with Z/offset) converted to the Home zone; default: today. */
	addCheckin(actor: Actor, habitId: number, input: { date?: string }): Checkin;
	/** Soft delete of the Check-in on that local date (default: today). */
	removeCheckin(actor: Actor, habitId: number, input: { date?: string }): Checkin;
	restoreCheckin(actor: Actor, checkinId: number): Checkin;
	listDeletedCheckins(): Checkin[];

	/**
	 * Progress and Streak of each Habit in the Period containing `date` (default today).
	 * `period` limits the result to week-based or month-based Habits; `habitId` to one Habit.
	 */
	habitStatus(opts: {
		period?: PeriodType;
		date?: string;
		habitId?: number;
		includeArchived?: boolean;
	}): HabitStatusResult;
}

interface HabitRow {
	id: number;
	title: string;
	schedule: string;
	archived_at: string | null;
	deleted_at: string | null;
	created_at: string;
}

const toHabit = (r: HabitRow): Habit => ({
	id: r.id,
	title: r.title,
	schedule: JSON.parse(r.schedule) as HabitSchedule,
	archivedAt: r.archived_at,
	createdAt: r.created_at
});

function normalizeSchedule(s: HabitSchedule): HabitSchedule {
	const intIn = (n: unknown, min: number, max: number) =>
		typeof n === 'number' && Number.isInteger(n) && n >= min && n <= max;
	switch (s?.type) {
		case 'per_week':
			if (!intIn(s.count, 1, 7)) throw new Error('A weekly target must be a whole number from 1 to 7');
			return { type: 'per_week', count: s.count };
		case 'per_month':
			if (!intIn(s.count, 1, 31)) throw new Error('A monthly target must be a whole number from 1 to 31');
			return { type: 'per_month', count: s.count };
		case 'weekdays': {
			if (!Array.isArray(s.days) || s.days.length === 0 || !s.days.every((d) => intIn(d, 1, 7)))
				throw new Error('Weekdays must be a non-empty list of numbers 1 (Monday) to 7 (Sunday)');
			return { type: 'weekdays', days: [...new Set(s.days)].sort((a, b) => a - b) };
		}
		default:
			throw new Error('Unknown schedule type (use per_week, per_month or weekdays)');
	}
}

const periodTypeOf = (s: HabitSchedule): PeriodType => (s.type === 'per_month' ? 'month' : 'week');

/** First day of the Period containing `d`, and the first day of the next one. */
function periodBounds(type: PeriodType, d: Temporal.PlainDate) {
	if (type === 'week') {
		const start = d.subtract({ days: d.dayOfWeek - 1 });
		return { start, next: start.add({ weeks: 1 }) };
	}
	const start = d.with({ day: 1 });
	return { start, next: start.add({ months: 1 }) };
}

function parseDate(s: string): Temporal.PlainDate {
	try {
		return Temporal.PlainDate.from(s, { overflow: 'reject' });
	} catch {
		throw new Error(`Invalid date "${s}" (expected YYYY-MM-DD)`);
	}
}

export function habitModule(ctx: CoreContext): HabitApi {
	const { db, nowIso, atomically, record, homeTimeZone } = ctx;

	const today = () => Temporal.Instant.from(nowIso()).toZonedDateTimeISO(homeTimeZone).toPlainDate();

	/** A date or an instant string -> local date in the Home zone. */
	function localDate(input: string | undefined): Temporal.PlainDate {
		if (input === undefined || input === '') return today();
		if (/^\d{4}-\d{2}-\d{2}$/.test(input)) return parseDate(input);
		try {
			return Temporal.Instant.from(input).toZonedDateTimeISO(homeTimeZone).toPlainDate();
		} catch {
			try {
				// A wall-clock time without an offset is read in the Home zone.
				return Temporal.PlainDateTime.from(input).toPlainDate();
			} catch {
				throw new Error(`Invalid date "${input}" (expected YYYY-MM-DD)`);
			}
		}
	}

	function getHabitRow(id: number, opts: { deleted?: boolean } = {}): HabitRow {
		const row = db.prepare('SELECT * FROM habit WHERE id = ?').get(id) as HabitRow | undefined;
		if (!row || (row.deleted_at !== null) !== (opts.deleted ?? false))
			throw new Error(`Habit ${id} not found`);
		return row;
	}
	const getHabit = (id: number) => toHabit(getHabitRow(id));

	function cleanTitle(t: string) {
		const title = t.trim();
		if (!title) throw new Error('Habit title must not be empty');
		return title;
	}

	function setArchived(actor: Actor, id: number, archived: boolean): Habit {
		return atomically(() => {
			const before = getHabit(id);
			if (archived === (before.archivedAt !== null))
				throw new Error(`Habit ${id} is already ${archived ? 'archived' : 'active'}`);
			db.prepare('UPDATE habit SET archived_at = ? WHERE id = ?').run(archived ? nowIso() : null, id);
			const after = getHabit(id);
			record(actor, archived ? 'habit.archive' : 'habit.unarchive', 'habit', id, before, after);
			return after;
		});
	}

	function getCheckin(id: number) {
		const row = db.prepare('SELECT id, habit_id, date, deleted_at FROM habit_checkin WHERE id = ?').get(id) as
			| { id: number; habit_id: number; date: string; deleted_at: string | null }
			| undefined;
		if (!row) throw new Error(`Check-in ${id} not found`);
		return row;
	}
	const toCheckin = (r: { id: number; habit_id: number; date: string }): Checkin => ({
		id: r.id,
		habitId: r.habit_id,
		date: r.date
	});

	function checkinDates(habitId: number): string[] {
		return (
			db
				.prepare('SELECT date FROM habit_checkin WHERE habit_id = ? AND deleted_at IS NULL ORDER BY date')
				.all(habitId) as { date: string }[]
		).map((r) => r.date);
	}

	/** Progress of one Habit in the Period starting at `start` (a Period start date). */
	function progress(habit: Habit, dates: string[], start: Temporal.PlainDate) {
		const type = periodTypeOf(habit.schedule);
		const { next } = periodBounds(type, start);
		const inPeriod = dates.filter((d) => d >= start.toString() && d < next.toString());
		let done = inPeriod.length;
		let target: number;
		if (habit.schedule.type === 'weekdays') {
			const days = habit.schedule.days;
			target = days.length;
			done = inPeriod.filter((d) => days.includes(Temporal.PlainDate.from(d).dayOfWeek)).length;
		} else {
			target = habit.schedule.count;
		}
		return { type, next, inPeriod, done, target, met: done >= target };
	}

	function statusOf(habit: Habit, ref: Temporal.PlainDate, now: Temporal.PlainDate): HabitStatus {
		const dates = checkinDates(habit.id);
		const type = periodTypeOf(habit.schedule);
		const { start } = periodBounds(type, ref);
		const cur = progress(habit, dates, start);
		const open = Temporal.PlainDate.compare(cur.next, now) > 0 && Temporal.PlainDate.compare(start, now) <= 0;

		// A past period that was not met has no streak. Otherwise: the current period counts if met
		// (an open, not-yet-met period is skipped, never a break), then walk back over closed met periods.
		let streak = cur.met ? 1 : 0;
		if (cur.met || open) {
			let cursor = start;
			for (;;) {
				const prevStart = periodBounds(type, cursor.subtract({ days: 1 })).start;
				if (!progress(habit, dates, prevStart).met) break;
				streak++;
				cursor = prevStart;
			}
		}

		return {
			habit,
			period: { type, start: start.toString(), end: cur.next.subtract({ days: 1 }).toString() },
			done: cur.done,
			target: cur.target,
			met: cur.met,
			open,
			streak,
			checkins: cur.inPeriod,
			checkedToday: dates.includes(now.toString())
		};
	}

	return {
		createHabit(actor, input) {
			const title = cleanTitle(input.title);
			const schedule = normalizeSchedule(input.schedule);
			return atomically(() => {
				const { lastInsertRowid } = db
					.prepare('INSERT INTO habit (title, schedule, created_at) VALUES (?, ?, ?)')
					.run(title, JSON.stringify(schedule), nowIso());
				const habit = getHabit(Number(lastInsertRowid));
				record(actor, 'habit.create', 'habit', habit.id, null, habit);
				return habit;
			});
		},
		updateHabit(actor, id, patch) {
			return atomically(() => {
				const before = getHabit(id);
				const title = patch.title === undefined ? before.title : cleanTitle(patch.title);
				const schedule = patch.schedule === undefined ? before.schedule : normalizeSchedule(patch.schedule);
				db.prepare('UPDATE habit SET title = ?, schedule = ? WHERE id = ?').run(
					title,
					JSON.stringify(schedule),
					id
				);
				const after = getHabit(id);
				record(actor, 'habit.update', 'habit', id, before, after);
				return after;
			});
		},
		archiveHabit: (actor, id) => setArchived(actor, id, true),
		unarchiveHabit: (actor, id) => setArchived(actor, id, false),
		deleteHabit(actor, id) {
			return atomically(() => {
				const before = getHabit(id);
				db.prepare('UPDATE habit SET deleted_at = ? WHERE id = ?').run(nowIso(), id);
				record(actor, 'habit.delete', 'habit', id, before, null);
				return before;
			});
		},
		restoreHabit(actor, id) {
			return atomically(() => {
				getHabitRow(id, { deleted: true });
				db.prepare('UPDATE habit SET deleted_at = NULL WHERE id = ?').run(id);
				const after = getHabit(id);
				record(actor, 'habit.restore', 'habit', id, null, after);
				return after;
			});
		},
		listHabits(opts = {}) {
			const rows = db
				.prepare('SELECT * FROM habit WHERE deleted_at IS NULL ORDER BY id')
				.all() as unknown as HabitRow[];
			return rows.map(toHabit).filter((h) => opts.includeArchived || h.archivedAt === null);
		},
		listDeletedHabits() {
			return (
				db.prepare('SELECT * FROM habit WHERE deleted_at IS NOT NULL ORDER BY id').all() as unknown as HabitRow[]
			).map(toHabit);
		},

		addCheckin(actor, habitId, input) {
			const date = localDate(input.date);
			if (Temporal.PlainDate.compare(date, today()) > 0)
				throw new Error(`Cannot check in on ${date} - that date is in the future`);
			return atomically(() => {
				getHabit(habitId);
				const dup = db
					.prepare('SELECT id FROM habit_checkin WHERE habit_id = ? AND date = ? AND deleted_at IS NULL')
					.get(habitId, date.toString());
				if (dup) throw new Error(`Habit ${habitId} is already checked in on ${date}`);
				const { lastInsertRowid } = db
					.prepare('INSERT INTO habit_checkin (habit_id, date, created_at) VALUES (?, ?, ?)')
					.run(habitId, date.toString(), nowIso());
				const checkin = toCheckin(getCheckin(Number(lastInsertRowid)));
				record(actor, 'checkin.add', 'checkin', checkin.id, null, checkin);
				return checkin;
			});
		},
		removeCheckin(actor, habitId, input) {
			const date = localDate(input.date);
			return atomically(() => {
				getHabit(habitId);
				const row = db
					.prepare('SELECT id FROM habit_checkin WHERE habit_id = ? AND date = ? AND deleted_at IS NULL')
					.get(habitId, date.toString()) as { id: number } | undefined;
				if (!row) throw new Error(`Habit ${habitId} has no check-in on ${date}`);
				const before = toCheckin(getCheckin(row.id));
				db.prepare('UPDATE habit_checkin SET deleted_at = ? WHERE id = ?').run(nowIso(), row.id);
				record(actor, 'checkin.remove', 'checkin', row.id, before, null);
				return before;
			});
		},
		restoreCheckin(actor, checkinId) {
			return atomically(() => {
				const row = getCheckin(checkinId);
				if (row.deleted_at === null) throw new Error(`Check-in ${checkinId} is not in the Trash`);
				getHabit(row.habit_id);
				const dup = db
					.prepare('SELECT id FROM habit_checkin WHERE habit_id = ? AND date = ? AND deleted_at IS NULL')
					.get(row.habit_id, row.date);
				if (dup) throw new Error(`Habit ${row.habit_id} is already checked in on ${row.date}`);
				db.prepare('UPDATE habit_checkin SET deleted_at = NULL WHERE id = ?').run(checkinId);
				const after = toCheckin(row);
				record(actor, 'checkin.restore', 'checkin', checkinId, null, after);
				return after;
			});
		},
		listDeletedCheckins() {
			return (
				db
					.prepare('SELECT id, habit_id, date FROM habit_checkin WHERE deleted_at IS NOT NULL ORDER BY id')
					.all() as { id: number; habit_id: number; date: string }[]
			).map(toCheckin);
		},

		habitStatus(opts) {
			const now = today();
			const ref = opts.date === undefined ? now : parseDate(opts.date);
			const habits = (
				opts.habitId === undefined
					? this.listHabits({ includeArchived: opts.includeArchived })
					: [getHabit(opts.habitId)]
			).filter((h) => !opts.period || periodTypeOf(h.schedule) === opts.period);
			return { date: ref.toString(), habits: habits.map((h) => statusOf(h, ref, now)) };
		}
	};
}
