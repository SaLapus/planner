/**
 * Reviews: weekly / monthly reflection. `reviewData` gathers everything a draft needs (the reusable
 * query behind the MCP tool `get_review_data`); a Review stores the draft and the owner's reflection.
 *
 * Periods are in the Home time zone: a week is ISO Monday..Sunday, a month is a calendar month.
 */
import type { CoreContext } from './context.js';
import type { Habit, HabitApi, PeriodType } from './habits.js';
import type { GoalApi, GoalProgress } from './goals.js';
import type { Task } from './tasks.js';
import { readTask } from './tasks.js';

export interface ReviewPeriod {
	type: PeriodType;
	/** First local date (YYYY-MM-DD). */
	start: string;
	/** Last local date, inclusive. */
	end: string;
}

/** One of a Habit's own Periods (ISO week or calendar month) that has ended. */
export interface HabitPeriodResult {
	start: string;
	end: string;
	done: number;
	target: number;
	met: boolean;
}

export interface HabitReview {
	habit: Habit;
	/**
	 * The Habit's own Periods that END inside the review period and have already ended (before today),
	 * oldest first. A weekly/weekday Habit in a month review gets the ISO weeks ending in that month; a monthly
	 * Habit in a week review usually gets none (its month is not over).
	 */
	periods: HabitPeriodResult[];
	/** Whole percent of `periods` that were met, or null when no Period could be judged. */
	hitRate: number | null;
	/** Local dates with a Check-in inside the review period (not just inside `periods`). */
	checkins: string[];
	/** Streak as of the end of the review period (or today, if the period is still running). */
	streak: number;
}

export interface ReviewData {
	period: ReviewPeriod;
	/** Active (not archived, not trashed) Habits that already existed by the end of the period. */
	habits: HabitReview[];
	/** Progress of active Goals AS OF NOW (not frozen at the period's end). */
	goals: GoalProgress[];
	tasks: {
		/** Tasks completed during the period (by Home-zone date of completion), in completion order. */
		done: Task[];
		/**
		 * SLIPPED: Tasks that are still open, whose due date lies inside the period, and whose due date is
		 * before today (Home zone). A Task completed later (even after the period) is no longer slipped.
		 * Tasks without a due date, or due before the period started, never count as slipped here.
		 */
		slipped: Task[];
	};
}

export interface ReviewApi {
	/** Everything a Review draft needs for the Period containing `date` (default: today). */
	reviewData(opts: { period: PeriodType; date?: string }): ReviewData;
}

export function periodOf(type: PeriodType, date: Temporal.PlainDate): ReviewPeriod {
	if (type === 'week') {
		const start = date.subtract({ days: date.dayOfWeek - 1 });
		return { type, start: start.toString(), end: start.add({ days: 6 }).toString() };
	}
	const start = date.with({ day: 1 });
	return { type, start: start.toString(), end: start.add({ months: 1 }).subtract({ days: 1 }).toString() };
}

export function reviewModule(ctx: CoreContext, habits: HabitApi, goals: GoalApi): ReviewApi {
	const { db, nowIso, homeTimeZone } = ctx;
	const today = () => Temporal.Instant.from(nowIso()).toZonedDateTimeISO(homeTimeZone).toPlainDate();

	function parseDate(d: string | undefined): Temporal.PlainDate {
		if (d === undefined || d === '') return today();
		try {
			return Temporal.PlainDate.from(d, { overflow: 'reject' });
		} catch {
			throw new Error(`Invalid date "${d}" (expected YYYY-MM-DD)`);
		}
	}
	const localDateOf = (iso: string) => Temporal.Instant.from(iso).toZonedDateTimeISO(homeTimeZone).toPlainDate().toString();
	/** Stored instants are `toISOString()` text, so bounds must use the same format to compare as text. */
	const startOfDayIso = (d: string) =>
		new Date(Temporal.PlainDate.from(d).toZonedDateTime(homeTimeZone).epochMilliseconds).toISOString();

	return {
		reviewData({ period: type, date }) {
			if (type !== 'week' && type !== 'month') throw new Error('period must be "week" or "month"');
			const period = periodOf(type, parseDate(date));
			const from = startOfDayIso(period.start);
			const to = startOfDayIso(Temporal.PlainDate.from(period.end).add({ days: 1 }).toString());
			const done = (
				db
					.prepare('SELECT id FROM task WHERE completed_at >= ? AND completed_at < ? ORDER BY completed_at, id')
					.all(from, to) as { id: number }[]
			).map((r) => readTask(db, r.id));
			const slipped = (
				db
					.prepare(
						`SELECT id FROM task WHERE completed_at IS NULL AND due_date >= ? AND due_date <= ? AND due_date < ?
						 ORDER BY due_date, due_time IS NULL, due_time, id`
					)
					.all(period.start, period.end, today().toString()) as { id: number }[]
			).map((r) => readTask(db, r.id));
			const now = today();
			const habitRows = habits
				.listHabits()
				.filter((h) => localDateOf(h.createdAt) <= period.end)
				.map((habit) => {
					const hType: PeriodType = habit.schedule.type === 'per_month' ? 'month' : 'week';
					const created = localDateOf(habit.createdAt);
					const periods: HabitPeriodResult[] = [];
					let p = periodOf(hType, Temporal.PlainDate.from(period.start));
					while (p.end <= period.end) {
						// Only periods that have ended (before today) and that the Habit already existed in are judged.
						if (p.end < now.toString() && p.end >= created) {
							const s = habits.habitStatus({ habitId: habit.id, date: p.start }).habits[0];
							periods.push({ start: p.start, end: p.end, done: s.done, target: s.target, met: s.met });
						}
						p = periodOf(hType, Temporal.PlainDate.from(p.end).add({ days: 1 }));
					}
					const met = periods.filter((x) => x.met).length;
					const asOf = period.end < now.toString() ? period.end : now.toString();
					return {
						habit,
						periods,
						hitRate: periods.length === 0 ? null : Math.round((met / periods.length) * 100),
						checkins: habits.listCheckinDates(habit.id, { from: period.start, to: period.end }),
						streak: habits.habitStatus({ habitId: habit.id, date: asOf }).habits[0].streak
					};
				});
			return { period, tasks: { done, slipped }, habits: habitRows, goals: goals.goalProgress({}) };
		}
	};
}
