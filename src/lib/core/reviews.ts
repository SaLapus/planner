/**
 * Reviews: weekly / monthly reflection. `reviewData` gathers everything a draft needs (the reusable
 * query behind the MCP tool `get_review_data`); a Review stores the draft and the owner's reflection.
 *
 * Periods are in the Home time zone: a week is ISO Monday..Sunday, a month is a calendar month.
 */
import type { Actor, CoreContext } from './context.js';
import { habitCreatedOn, habitExistedBy, type Habit, type HabitApi, type PeriodType } from './habits.js';
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

export interface Review {
	id: number;
	periodType: PeriodType;
	/** First local date of the period (Monday for a week, the 1st for a month). */
	periodStart: string;
	/** Markdown, usually written by Claude from `reviewData`. */
	draft: string;
	/** Markdown, the owner's own reflection. */
	reflection: string;
	createdAt: string;
	updatedAt: string;
}

export interface ReviewData {
	period: ReviewPeriod;
	/** Habits that existed during the period (created by its end, not trashed), including ones archived AFTER it. */
	habits: HabitReview[];
	/** CURRENT progress of active Goals, not as of the period's end: Milestone completion, links and Goal status are not time-stamped, so history cannot be reconstructed (labelled as such in the UI and MCP). */
	goals: GoalProgress[];
	/** The Review already saved for this period (so it can be updated instead of duplicated), or null. */
	review: Review | null;
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
	/** One Review per period. `date` is any local date inside the period (default today). Refused if the period already has one. */
	createReview(
		actor: Actor,
		input: { period: PeriodType; date?: string; draft?: string; reflection?: string }
	): Review;
	/** Change the draft and/or the reflection (omitted fields stay as they are). */
	updateReview(actor: Actor, id: number, patch: { draft?: string; reflection?: string }): Review;
	getReview(id: number): Review;
	/** Newest period first; optionally only weekly or only monthly ones. Delete via `deleteItem(actor, 'review', id)`. */
	listReviews(opts?: { period?: PeriodType }): Review[];
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
	const { db, nowIso, homeTimeZone, atomically, record, entities } = ctx;
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
	const checkType = (type: string) => {
		if (type !== 'week' && type !== 'month') throw new Error('period must be "week" or "month"');
	};

	interface Row {
		id: number;
		period_type: PeriodType;
		period_start: string;
		draft: string;
		reflection: string;
		created_at: string;
		updated_at: string;
	}
	const toReview = (r: Row): Review => ({
		id: r.id,
		periodType: r.period_type,
		periodStart: r.period_start,
		draft: r.draft,
		reflection: r.reflection,
		createdAt: r.created_at,
		updatedAt: r.updated_at
	});
	function readReview(id: number): Review | null {
		const row = db.prepare('SELECT * FROM review WHERE id = ?').get(id) as Row | undefined;
		return row ? toReview(row) : null;
	}
	function getReview(id: number): Review {
		const r = readReview(id);
		if (!r) throw new Error(`Review ${id} not found`);
		return r;
	}
	function reviewOf(type: PeriodType, start: string): Review | null {
		const row = db
			.prepare('SELECT * FROM review WHERE period_type = ? AND period_start = ?')
			.get(type, start) as Row | undefined;
		return row ? toReview(row) : null;
	}

	// Makes Reviews trashable and undoable (generic mechanism in safety.ts).
	entities.register<Review>({
		type: 'review',
		read: readReview,
		write: (r) => {
			const clash = reviewOf(r.periodType, r.periodStart);
			if (clash && clash.id !== r.id)
				throw new Error(
					`the ${r.periodType} starting ${r.periodStart} already has review #${clash.id}; delete or edit that one first`
				);
			db.prepare(
				'INSERT OR REPLACE INTO review (id, period_type, period_start, draft, reflection, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
			).run(r.id, r.periodType, r.periodStart, r.draft, r.reflection, r.createdAt, r.updatedAt);
		},
		remove: (id) => void db.prepare('DELETE FROM review WHERE id = ?').run(id),
		label: (r) => `${r.periodType} ${r.periodStart}`
	});

	function habitReviews(period: ReviewPeriod): HabitReview[] {
		const now = today().toString();
		// Habits that existed during the period (created by its end, not in Trash), including ones
		// archived AFTER the period; ones archived before or during it are left out.
		return habits
			.listHabits({ includeArchived: true })
			.filter((h) => habitCreatedOn(h, homeTimeZone) <= period.end)
			.filter((h) => h.archivedAt === null || localDateOf(h.archivedAt) > period.end)
			.map((habit) => {
				const hType: PeriodType = habit.schedule.type === 'per_month' ? 'month' : 'week';
				const periods: HabitPeriodResult[] = [];
				let p = periodOf(hType, Temporal.PlainDate.from(period.start));
				while (p.end <= period.end) {
					// Only periods that have ended (before today) and that the Habit already existed in are judged.
					if (p.end < now && habitExistedBy(habit, p.end, homeTimeZone)) {
						const s = habits.habitStatus({ habitId: habit.id, date: p.start }).habits[0];
						periods.push({ start: p.start, end: p.end, done: s.done, target: s.target, met: s.met });
					}
					p = periodOf(hType, Temporal.PlainDate.from(p.end).add({ days: 1 }));
				}
				const met = periods.filter((x) => x.met).length;
				const asOf = period.end < now ? period.end : now;
				return {
					habit,
					periods,
					hitRate: periods.length === 0 ? null : Math.round((met / periods.length) * 100),
					checkins: habits.listCheckinDates(habit.id, { from: period.start, to: period.end }),
					streak: habits.habitStatus({ habitId: habit.id, date: asOf }).habits[0].streak
				};
			});
	}

	return {
		createReview(actor, input) {
			checkType(input.period);
			const period = periodOf(input.period, parseDate(input.date));
			return atomically(() => {
				const existing = reviewOf(input.period, period.start);
				if (existing)
					throw new Error(
						`A ${input.period} review for ${period.start} already exists (id ${existing.id}); use update_review to change it`
					);
				const now = nowIso();
				const { lastInsertRowid } = db
					.prepare(
						'INSERT INTO review (period_type, period_start, draft, reflection, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
					)
					.run(input.period, period.start, input.draft ?? '', input.reflection ?? '', now, now);
				const review = getReview(Number(lastInsertRowid));
				record(actor, 'review.create', 'review', review.id, null, review);
				return review;
			});
		},
		updateReview(actor, id, patch) {
			return atomically(() => {
				const before = getReview(id);
				db.prepare('UPDATE review SET draft = ?, reflection = ?, updated_at = ? WHERE id = ?').run(
					patch.draft ?? before.draft,
					patch.reflection ?? before.reflection,
					nowIso(),
					id
				);
				const after = getReview(id);
				record(actor, 'review.update', 'review', id, before, after);
				return after;
			});
		},
		getReview,
		listReviews(opts = {}) {
			const rows = db
				.prepare('SELECT * FROM review ORDER BY period_start DESC, period_type DESC, id DESC')
				.all() as unknown as Row[];
			return rows.map(toReview).filter((r) => !opts.period || r.periodType === opts.period);
		},

		reviewData({ period: type, date }) {
			checkType(type);
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
			return {
				period,
				tasks: { done, slipped },
				habits: habitReviews(period),
				goals: goals.goalProgress({}),
				review: reviewOf(type, period.start)
			};
		}
	};
}
