/**
 * Reviews: weekly / monthly reflection. `reviewData` gathers everything a draft needs (the reusable
 * query behind the MCP tool `get_review_data`); a Review stores the draft and the owner's reflection.
 *
 * Periods are in the Home time zone: a week is ISO Monday..Sunday, a month is a calendar month.
 */
import type { CoreContext } from './context.js';
import type { HabitApi, PeriodType } from './habits.js';
import type { GoalApi } from './goals.js';
import type { Task } from './tasks.js';
import { readTask } from './tasks.js';

export interface ReviewPeriod {
	type: PeriodType;
	/** First local date (YYYY-MM-DD). */
	start: string;
	/** Last local date, inclusive. */
	end: string;
}

export interface ReviewData {
	period: ReviewPeriod;
	tasks: { done: Task[] };
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
			return { period, tasks: { done } };
		}
	};
}
