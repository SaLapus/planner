/**
 * Stats: read-only aggregates for the stats page (and anything else that wants trends).
 *
 * One query, `stats`, returns three parts:
 *  - `habits`: per active Habit, its last N Periods (weeks or months, oldest first) with done/target,
 *    plus a hit-rate = % of CLOSED Periods that were met (the open Period is shown but not held against you);
 *  - `tasksPerWeek`: Tasks completed in each of the last N Monday-start weeks (Home zone), zeros included;
 *  - `goals`: `goalProgress` of every active Goal.
 * It reuses `habitStatus` and `goalProgress`; it adds no rules of its own and writes nothing.
 */
import type { CoreContext } from './context.js';
import type { Habit, HabitApi, PeriodType } from './habits.js';
import type { GoalApi, GoalProgress } from './goals.js';

export interface HabitPeriodStat {
	/** First and last local date of the Period (inclusive). */
	start: string;
	end: string;
	done: number;
	target: number;
	met: boolean;
	/** The Period still contains today. */
	open: boolean;
}

export interface HabitHitRate {
	habit: Habit;
	periodType: PeriodType;
	/** Oldest first; the last one is the current Period. */
	periods: HabitPeriodStat[];
	/** Whole percent of closed Periods that were met; null when no Period has closed yet. */
	hitRate: number | null;
}

export interface WeekCount {
	/** Monday of the week (local date) and the Sunday that ends it. */
	start: string;
	end: string;
	count: number;
}

export interface Stats {
	habits: HabitHitRate[];
	tasksPerWeek: WeekCount[];
	goals: GoalProgress[];
}

export interface StatsApi {
	/** `periods` (default 8) = Periods per Habit; `weeks` (default 8) = weeks of completed Tasks. Max 52 each. */
	stats(opts: { periods?: number; weeks?: number }): Stats;
}

function count(n: number | undefined, name: string): number {
	const v = n ?? 8;
	if (!Number.isInteger(v) || v < 1 || v > 52) throw new Error(`${name} must be a whole number from 1 to 52`);
	return v;
}

export function statsModule(ctx: CoreContext, habits: HabitApi, goals: GoalApi): StatsApi {
	const { db, nowIso, homeTimeZone } = ctx;
	const today = () => Temporal.Instant.from(nowIso()).toZonedDateTimeISO(homeTimeZone).toPlainDate();
	const mondayOf = (d: Temporal.PlainDate) => d.subtract({ days: d.dayOfWeek - 1 });

	return {
		stats(opts) {
			const periods = count(opts.periods, 'periods');
			const weeks = count(opts.weeks, 'weeks');
			const now = today();

			// Habits: ask habitStatus "as of" a date inside each past Period.
			const habitStats: HabitHitRate[] = habits.listHabits().map((habit) => {
				const periodType: PeriodType = habit.schedule.type === 'per_month' ? 'month' : 'week';
				const list: HabitPeriodStat[] = [];
				for (let i = periods - 1; i >= 0; i--) {
					const date = (periodType === 'week' ? now.subtract({ weeks: i }) : now.subtract({ months: i })).toString();
					const s = habits.habitStatus({ habitId: habit.id, date }).habits[0];
					list.push({
						start: s.period.start,
						end: s.period.end,
						done: s.done,
						target: s.target,
						met: s.met,
						open: s.open
					});
				}
				const closed = list.filter((p) => !p.open);
				const hitRate = closed.length === 0 ? null : Math.round((100 * closed.filter((p) => p.met).length) / closed.length);
				return { habit, periodType, periods: list, hitRate };
			});

			// Tasks: bucket completion instants by local Monday.
			const firstMonday = mondayOf(now).subtract({ weeks: weeks - 1 });
			const buckets = new Map<string, number>();
			const rows = db.prepare('SELECT completed_at FROM task WHERE completed_at IS NOT NULL').all() as {
				completed_at: string;
			}[];
			for (const r of rows) {
				const monday = mondayOf(Temporal.Instant.from(r.completed_at).toZonedDateTimeISO(homeTimeZone).toPlainDate());
				const key = monday.toString();
				buckets.set(key, (buckets.get(key) ?? 0) + 1);
			}
			const tasksPerWeek: WeekCount[] = [];
			for (let i = 0; i < weeks; i++) {
				const start = firstMonday.add({ weeks: i });
				tasksPerWeek.push({
					start: start.toString(),
					end: start.add({ days: 6 }).toString(),
					count: buckets.get(start.toString()) ?? 0
				});
			}

			return { habits: habitStats, tasksPerWeek, goals: goals.goalProgress({}) };
		}
	};
}
