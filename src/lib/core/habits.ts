/**
 * Habits, Check-ins, Periods and Streaks.
 *
 * Words (see the spec): a Check-in is "done on this local date" (Home time zone), at most one per
 * Habit per date. A Period is an ISO week (Monday start) for per-week / weekday Habits, or a
 * calendar month for per-month Habits. A Period is *met* when the target is reached. A Streak is the
 * number of consecutive met Periods ending at the last closed Period, plus the current one if it is
 * already met; the open Period never breaks a Streak.
 *
 * Habits and Check-ins are registered with the generic Trash/undo (see `ctx.entities`): delete with
 * `planner.deleteItem(actor, 'habit' | 'checkin', id)`, restore with `restoreItem`, revert with `undoChange`.
 * A Habit's snapshot (what Trash and the change log store) includes its Check-ins, so deleting and
 * restoring a Habit keeps its history. Check-ins are still separate entities: they are NOT part of
 * what undo compares or rewrites, so a later Check-in neither blocks undoing a Habit edit nor gets
 * wiped by it.
 */
import type { Actor, CoreContext } from './context.js';
import type { SafetyApi } from './safety.js';

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
	/** Goal this Habit supports (0..1). Managed by goals.ts; dormant while the Goal is in Trash. */
	goalId: number | null;
}

export interface Checkin {
	id: number;
	habitId: number;
	createdAt: string;
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
	listHabits(opts?: { includeArchived?: boolean }): Habit[];

	/** `date` is a local date, or an instant (ISO with Z/offset) converted to the Home zone; default: today. */
	addCheckin(actor: Actor, habitId: number, input: { date?: string }): Checkin;
	/**
	 * Removes the Check-in of a Habit on a local date (default today) by moving it to Trash (the generic
	 * delete, so it can be restored or undone). Returns it; throws if there is none.
	 */
	removeCheckin(actor: Actor, habitId: number, date?: string): Checkin;
	/** The active Check-in of a Habit on a local date (default today), or null. Delete it with `deleteItem(actor, 'checkin', id)`. */
	checkinOn(habitId: number, date?: string): Checkin | null;
	/** Local dates (sorted) with a Check-in for the Habit, between `from` and `to` inclusive. */
	listCheckinDates(habitId: number, range: { from: string; to: string }): string[];

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
	created_at: string;
	goal_id: number | null;
}

interface CheckinRow {
	id: number;
	habit_id: number;
	date: string;
	created_at: string;
}
const toCheckin = (r: CheckinRow): Checkin => ({
	id: r.id,
	habitId: r.habit_id,
	date: r.date,
	createdAt: r.created_at
});

/** What Trash and the change log keep for a Habit: the Habit plus its Check-ins. */
type HabitSnapshot = Habit & { checkins: Checkin[] };

const toHabit = (r: HabitRow): Habit => ({
	id: r.id,
	title: r.title,
	schedule: JSON.parse(r.schedule) as HabitSchedule,
	archivedAt: r.archived_at,
	createdAt: r.created_at,
	goalId: r.goal_id
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

/** The local (Home zone) calendar date a Habit was created on. */
export const habitCreatedOn = (habit: Habit, homeTimeZone: string): string =>
	Temporal.Instant.from(habit.createdAt).toZonedDateTimeISO(homeTimeZone).toPlainDate().toString();

/**
 * Whether a Period (ending on local date `periodEnd`) is one the Habit already existed in. Periods
 * that ended before the Habit was created are not judged (shared by Reviews and Stats).
 */
export const habitExistedBy = (habit: Habit, periodEnd: string, homeTimeZone: string): boolean =>
	periodEnd >= habitCreatedOn(habit, homeTimeZone);

export function habitModule(ctx: CoreContext, safety: Pick<SafetyApi, 'deleteItem'>): HabitApi {
	const { db, nowIso, atomically, record, entities, homeTimeZone } = ctx;

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

	function getHabitRow(id: number): HabitRow {
		const row = db.prepare('SELECT * FROM habit WHERE id = ?').get(id) as HabitRow | undefined;
		if (!row) throw new Error(`Habit ${id} not found`);
		return row;
	}
	/** Full snapshot (Habit + its Check-ins), or null: what Trash and the change log store. */
	function readHabit(id: number): HabitSnapshot | null {
		const row = db.prepare('SELECT * FROM habit WHERE id = ?').get(id) as HabitRow | undefined;
		if (!row) return null;
		return {
			...toHabit(row),
			checkins: (db.prepare('SELECT * FROM habit_checkin WHERE habit_id = ? ORDER BY id').all(id) as unknown as CheckinRow[]).map(toCheckin)
		};
	}
	function snapshot(id: number): HabitSnapshot {
		const h = readHabit(id);
		if (!h) throw new Error(`Habit ${id} not found`);
		return h;
	}
	const getHabit = (id: number): Habit => toHabit(getHabitRow(id));
	const plain = ({ checkins: _c, ...habit }: HabitSnapshot): Habit => habit;

	function cleanTitle(t: string) {
		const title = t.trim();
		if (!title) throw new Error('Habit title must not be empty');
		return title;
	}

	function setArchived(actor: Actor, id: number, archived: boolean): Habit {
		return atomically(() => {
			const before = snapshot(id);
			if (archived === (before.archivedAt !== null))
				throw new Error(`Habit ${id} is already ${archived ? 'archived' : 'active'}`);
			db.prepare('UPDATE habit SET archived_at = ? WHERE id = ?').run(archived ? nowIso() : null, id);
			const after = snapshot(id);
			record(actor, archived ? 'habit.archive' : 'habit.unarchive', 'habit', id, before, after);
			return plain(after);
		});
	}

	function readCheckin(id: number): Checkin | null {
		const row = db.prepare('SELECT * FROM habit_checkin WHERE id = ?').get(id) as CheckinRow | undefined;
		return row ? toCheckin(row) : null;
	}

	// Makes Habits and Check-ins trashable and undoable (generic mechanism in safety.ts).
	entities.register<HabitSnapshot>({
		type: 'habit',
		read: readHabit,
		comparable: ({ checkins: _c, ...habit }) => habit,
		write: (h) => {
			const exists = db.prepare('SELECT 1 FROM habit WHERE id = ?').get(h.id) !== undefined;
			db.prepare(
				'INSERT OR REPLACE INTO habit (id, title, schedule, archived_at, created_at, goal_id) VALUES (?, ?, ?, ?, ?, ?)'
			).run(h.id, h.title, JSON.stringify(h.schedule), h.archivedAt, h.createdAt, h.goalId);
			// An existing Habit keeps the Check-ins it has now; only a Habit coming back from Trash brings its history.
			if (exists) return;
			db.prepare('DELETE FROM habit_checkin WHERE habit_id = ?').run(h.id);
			for (const c of h.checkins) {
				db.prepare('INSERT INTO habit_checkin (id, habit_id, date, created_at) VALUES (?, ?, ?, ?)').run(
					c.id,
					h.id,
					c.date,
					c.createdAt
				);
			}
		},
		remove: (id) => {
			db.prepare('DELETE FROM habit_checkin WHERE habit_id = ?').run(id);
			db.prepare('DELETE FROM habit WHERE id = ?').run(id);
		},
		label: (h) => h.title
	});
	entities.register<Checkin>({
		type: 'checkin',
		read: readCheckin,
		write: (c) => {
			if (!db.prepare('SELECT 1 FROM habit WHERE id = ?').get(c.habitId))
				throw new Error(`its habit ${c.habitId} is in Trash or gone; restore the habit first`);
			if (db.prepare('SELECT 1 FROM habit_checkin WHERE habit_id = ? AND date = ? AND id <> ?').get(c.habitId, c.date, c.id))
				throw new Error(`the habit is already checked in on ${c.date}`);
			db.prepare(
				'INSERT OR REPLACE INTO habit_checkin (id, habit_id, date, created_at) VALUES (?, ?, ?, ?)'
			).run(c.id, c.habitId, c.date, c.createdAt);
		},
		remove: (id) => void db.prepare('DELETE FROM habit_checkin WHERE id = ?').run(id),
		label: (c) => {
			const h = db.prepare('SELECT title FROM habit WHERE id = ?').get(c.habitId) as { title: string } | undefined;
			return `${h?.title ?? `habit #${c.habitId}`}, ${c.date}`;
		}
	});

	function checkinDates(habitId: number): string[] {
		return (
			db
				.prepare('SELECT date FROM habit_checkin WHERE habit_id = ? ORDER BY date')
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

	function checkinOn(habitId: number, date?: string): Checkin | null {
		const row = db
			.prepare('SELECT * FROM habit_checkin WHERE habit_id = ? AND date = ?')
			.get(habitId, localDate(date).toString()) as CheckinRow | undefined;
		return row ? toCheckin(row) : null;
	}

	return {
		createHabit(actor, input) {
			const title = cleanTitle(input.title);
			const schedule = normalizeSchedule(input.schedule);
			return atomically(() => {
				const { lastInsertRowid } = db
					.prepare('INSERT INTO habit (title, schedule, created_at) VALUES (?, ?, ?)')
					.run(title, JSON.stringify(schedule), nowIso());
				const habit = snapshot(Number(lastInsertRowid));
				record(actor, 'habit.create', 'habit', habit.id, null, habit);
				return plain(habit);
			});
		},
		updateHabit(actor, id, patch) {
			return atomically(() => {
				const before = snapshot(id);
				const title = patch.title === undefined ? before.title : cleanTitle(patch.title);
				const schedule = patch.schedule === undefined ? before.schedule : normalizeSchedule(patch.schedule);
				db.prepare('UPDATE habit SET title = ?, schedule = ? WHERE id = ?').run(
					title,
					JSON.stringify(schedule),
					id
				);
				const after = snapshot(id);
				record(actor, 'habit.update', 'habit', id, before, after);
				return plain(after);
			});
		},
		archiveHabit: (actor, id) => setArchived(actor, id, true),
		unarchiveHabit: (actor, id) => setArchived(actor, id, false),
		listHabits(opts = {}) {
			const rows = db.prepare('SELECT * FROM habit ORDER BY id').all() as unknown as HabitRow[];
			return rows.map(toHabit).filter((h) => opts.includeArchived || h.archivedAt === null);
		},

		addCheckin(actor, habitId, input) {
			const date = localDate(input.date);
			if (Temporal.PlainDate.compare(date, today()) > 0)
				throw new Error(`Cannot check in on ${date} - that date is in the future`);
			return atomically(() => {
				getHabit(habitId);
				const dup = db
					.prepare('SELECT id FROM habit_checkin WHERE habit_id = ? AND date = ?')
					.get(habitId, date.toString());
				if (dup) throw new Error(`Habit ${habitId} is already checked in on ${date}`);
				const { lastInsertRowid } = db
					.prepare('INSERT INTO habit_checkin (habit_id, date, created_at) VALUES (?, ?, ?)')
					.run(habitId, date.toString(), nowIso());
				const checkin = readCheckin(Number(lastInsertRowid))!;
				record(actor, 'checkin.add', 'checkin', checkin.id, null, checkin);
				return checkin;
			});
		},
		checkinOn,
		removeCheckin(actor, habitId, date) {
			const checkin = checkinOn(habitId, date);
			if (!checkin) throw new Error(`Habit ${habitId} has no check-in on ${date ?? 'today'}`);
			safety.deleteItem(actor, 'checkin', checkin.id);
			return checkin;
		},

		listCheckinDates(habitId, { from, to }) {
			getHabit(habitId);
			return checkinDates(habitId).filter((d) => d >= from && d <= to);
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
