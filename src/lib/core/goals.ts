/**
 * Goals and Milestones.
 *
 * A Goal (title, description, status, optional target date) is broken into ordered Milestones
 * (title, optional target date, done flag). Tasks link to a Milestone and Habits link to a Goal
 * (`Task.milestoneId`, `Habit.goalId`); `goalProgress` reports done/total Milestones together with
 * the linked Tasks and Habits (the reusable query for the UI, MCP, Reviews and Stats).
 *
 * Trash and undo are generic (see `ctx.entities`): `deleteItem(actor, 'goal' | 'milestone', id)`.
 * A Goal's snapshot contains its Milestones, so deleting and restoring a Goal brings them back.
 *
 * What happens to links when a Goal / Milestone leaves the active data (deliberate policy):
 *  - archive-like moves (status paused/achieved/dropped, Habit archived, Task completed) never touch links;
 *  - Trash never touches links either. The `milestone_id` / `goal_id` stay stored on the Task / Habit row,
 *    DORMANT: reads (`goalProgress`, `linkedMilestone...`) only see targets that exist, so a Task whose
 *    Milestone is in Trash counts nowhere; restoring the Goal / Milestone makes the links live again.
 *    Ids are never reused (AUTOINCREMENT), so a dormant link can never point to a different thing.
 *  - You cannot create a NEW link to a Goal / Milestone that is in Trash or gone.
 *  - After purge (30 days) the link stays dormant forever; clear it by linking to null.
 */
import type { Actor, CoreContext } from './context.js';
import type { Habit, HabitApi, HabitStatus } from './habits.js';
import { readTask, type Task } from './tasks.js';

export const GOAL_STATUSES = ['active', 'paused', 'achieved', 'dropped'] as const;
export type GoalStatus = (typeof GOAL_STATUSES)[number];

export interface Goal {
	id: number;
	title: string;
	description: string;
	status: GoalStatus;
	/** Local date YYYY-MM-DD or null. */
	targetDate: string | null;
	createdAt: string;
}

export interface Milestone {
	id: number;
	goalId: number;
	title: string;
	targetDate: string | null;
	done: boolean;
	/** Order inside the Goal (ascending). Use `reorderMilestones` to change it. */
	position: number;
}

/** A Goal with its ordered Milestones: what Trash and the change log keep. */
export type GoalWithMilestones = Goal & { milestones: Milestone[] };

/**
 * Everything about one Goal's progress. Links to Milestones / Goals that are in Trash are not counted
 * (dormant, see the policy above).
 */
export interface GoalProgress {
	goal: Goal;
	milestones: {
		done: number;
		total: number;
		/** done / total as a whole percent (0 when there are no Milestones). */
		percent: number;
	};
	milestoneList: Milestone[];
	/** Tasks linked to any Milestone of this Goal (done ones included), with the Milestone they serve. */
	tasks: { done: number; total: number; items: { task: Task; milestoneId: number }[] };
	/** Habits linked to this Goal (archived ones too), each with its current Period status and Streak. */
	habits: HabitStatus[];
}

export interface GoalApi {
	createGoal(actor: Actor, input: { title: string; description?: string; targetDate?: string | null }): Goal;
	updateGoal(
		actor: Actor,
		id: number,
		patch: { title?: string; description?: string; targetDate?: string | null }
	): Goal;
	/** Any status to any other; setting the status it already has is refused. */
	setGoalStatus(actor: Actor, id: number, status: GoalStatus): Goal;
	getGoal(id: number): GoalWithMilestones;
	/** Newest last (by id). Without `status`, every Goal. */
	listGoals(opts?: { status?: GoalStatus }): Goal[];

	addMilestone(actor: Actor, goalId: number, input: { title: string; targetDate?: string | null }): Milestone;
	updateMilestone(actor: Actor, id: number, patch: { title?: string; targetDate?: string | null }): Milestone;
	setMilestoneDone(actor: Actor, id: number, done: boolean): Milestone;
	/** `orderedIds` must list every Milestone of the Goal exactly once. */
	reorderMilestones(actor: Actor, goalId: number, orderedIds: number[]): GoalWithMilestones;

	/** Link a Task to a Milestone (or `null` to unlink). The Milestone must exist (not be in Trash). */
	setTaskMilestone(actor: Actor, taskId: number, milestoneId: number | null): Task;
	/** Link a Habit to a Goal (or `null` to unlink). The Goal must exist (not be in Trash). */
	linkHabitToGoal(actor: Actor, habitId: number, goalId: number | null): Habit;

	/**
	 * Progress of one Goal (`goalId`) or of every active Goal (default; `includeInactive` adds paused /
	 * achieved / dropped ones). Habit status is as of today, via `habitStatus`. Reused by Reviews and Stats.
	 */
	goalProgress(opts: { goalId?: number; includeInactive?: boolean }): GoalProgress[];
}

interface GoalRow {
	id: number;
	title: string;
	description: string;
	status: GoalStatus;
	target_date: string | null;
	created_at: string;
}
interface MilestoneRow {
	id: number;
	goal_id: number;
	title: string;
	target_date: string | null;
	done: number;
	position: number;
}

const toGoal = (r: GoalRow): Goal => ({
	id: r.id,
	title: r.title,
	description: r.description,
	status: r.status,
	targetDate: r.target_date,
	createdAt: r.created_at
});
const toMilestone = (r: MilestoneRow): Milestone => ({
	id: r.id,
	goalId: r.goal_id,
	title: r.title,
	targetDate: r.target_date,
	done: r.done === 1,
	position: r.position
});

function cleanTitle(t: string, what: string) {
	const title = t.trim();
	if (!title) throw new Error(`${what} title must not be empty`);
	return title;
}

function cleanDate(d: string | null | undefined): string | null {
	if (d === null || d === undefined || d === '') return null;
	try {
		return Temporal.PlainDate.from(d, { overflow: 'reject' }).toString();
	} catch {
		throw new Error(`Invalid date "${d}" (expected YYYY-MM-DD)`);
	}
}

export function goalModule(ctx: CoreContext, habits: HabitApi): GoalApi {
	const { db, nowIso, atomically, record, entities } = ctx;

	const milestonesOf = (goalId: number): Milestone[] =>
		(
			db.prepare('SELECT * FROM milestone WHERE goal_id = ? ORDER BY position, id').all(goalId) as unknown as MilestoneRow[]
		).map(toMilestone);

	function readGoal(id: number): GoalWithMilestones | null {
		const row = db.prepare('SELECT * FROM goal WHERE id = ?').get(id) as GoalRow | undefined;
		return row ? { ...toGoal(row), milestones: milestonesOf(id) } : null;
	}
	function snapshot(id: number): GoalWithMilestones {
		const g = readGoal(id);
		if (!g) throw new Error(`Goal ${id} not found`);
		return g;
	}
	function readMilestone(id: number): Milestone | null {
		const row = db.prepare('SELECT * FROM milestone WHERE id = ?').get(id) as MilestoneRow | undefined;
		return row ? toMilestone(row) : null;
	}
	function milestone(id: number): Milestone {
		const m = readMilestone(id);
		if (!m) throw new Error(`Milestone ${id} not found`);
		return m;
	}
	const plain = ({ milestones: _m, ...goal }: GoalWithMilestones): Goal => goal;

	function insertMilestone(m: Milestone) {
		db.prepare(
			'INSERT OR REPLACE INTO milestone (id, goal_id, title, target_date, done, position) VALUES (?, ?, ?, ?, ?, ?)'
		).run(m.id, m.goalId, m.title, m.targetDate, m.done ? 1 : 0, m.position);
	}

	entities.register<GoalWithMilestones>({
		type: 'goal',
		read: readGoal,
		write: (g) => {
			db.prepare(
				'INSERT OR REPLACE INTO goal (id, title, description, status, target_date, created_at) VALUES (?, ?, ?, ?, ?, ?)'
			).run(g.id, g.title, g.description, g.status, g.targetDate, g.createdAt);
			db.prepare('DELETE FROM milestone WHERE goal_id = ?').run(g.id);
			g.milestones.forEach(insertMilestone);
		},
		remove: (id) => {
			db.prepare('DELETE FROM milestone WHERE goal_id = ?').run(id);
			db.prepare('DELETE FROM goal WHERE id = ?').run(id);
		},
		label: (g) => g.title
	});
	entities.register<Milestone>({
		type: 'milestone',
		read: readMilestone,
		write: (m) => {
			if (!db.prepare('SELECT 1 FROM goal WHERE id = ?').get(m.goalId))
				throw new Error(`its goal ${m.goalId} is in Trash or gone; restore the goal first`);
			insertMilestone(m);
		},
		remove: (id) => void db.prepare('DELETE FROM milestone WHERE id = ?').run(id),
		label: (m) => m.title
	});

	function changeGoal(actor: Actor, id: number, action: string, mutate: (before: GoalWithMilestones) => void): Goal {
		return atomically(() => {
			const before = snapshot(id);
			mutate(before);
			const after = snapshot(id);
			record(actor, action, 'goal', id, before, after);
			return plain(after);
		});
	}
	function changeMilestone(actor: Actor, id: number, action: string, mutate: (before: Milestone) => void): Milestone {
		return atomically(() => {
			const before = milestone(id);
			mutate(before);
			const after = milestone(id);
			record(actor, action, 'milestone', id, before, after);
			return after;
		});
	}

	function progressOf(goal: Goal): GoalProgress {
		const milestoneList = milestonesOf(goal.id);
		const done = milestoneList.filter((m) => m.done).length;
		const items = (
			db
				.prepare(
					`SELECT t.id, t.milestone_id FROM task t JOIN milestone m ON m.id = t.milestone_id
					 WHERE m.goal_id = ? ORDER BY m.position, m.id, t.id`
				)
				.all(goal.id) as { id: number; milestone_id: number }[]
		).map((r) => ({ task: readTask(db, r.id), milestoneId: r.milestone_id }));
		const habitIds = (
			db.prepare('SELECT id FROM habit WHERE goal_id = ? ORDER BY id').all(goal.id) as { id: number }[]
		).map((r) => r.id);
		return {
			goal,
			milestones: {
				done,
				total: milestoneList.length,
				percent: milestoneList.length === 0 ? 0 : Math.round((done / milestoneList.length) * 100)
			},
			milestoneList,
			tasks: { done: items.filter((i) => i.task.completedAt !== null).length, total: items.length, items },
			habits: habitIds.map((habitId) => habits.habitStatus({ habitId, includeArchived: true }).habits[0])
		};
	}

	return {
		createGoal(actor, input) {
			const title = cleanTitle(input.title, 'Goal');
			const targetDate = cleanDate(input.targetDate);
			return atomically(() => {
				const { lastInsertRowid } = db
					.prepare('INSERT INTO goal (title, description, target_date, created_at) VALUES (?, ?, ?, ?)')
					.run(title, input.description ?? '', targetDate, nowIso());
				const goal = snapshot(Number(lastInsertRowid));
				record(actor, 'goal.create', 'goal', goal.id, null, goal);
				return plain(goal);
			});
		},
		updateGoal(actor, id, patch) {
			return changeGoal(actor, id, 'goal.update', (before) => {
				const title = patch.title === undefined ? before.title : cleanTitle(patch.title, 'Goal');
				const targetDate = patch.targetDate === undefined ? before.targetDate : cleanDate(patch.targetDate);
				db.prepare('UPDATE goal SET title = ?, description = ?, target_date = ? WHERE id = ?').run(
					title,
					patch.description ?? before.description,
					targetDate,
					id
				);
			});
		},
		setGoalStatus(actor, id, status) {
			if (!(GOAL_STATUSES as readonly string[]).includes(status))
				throw new Error(`Invalid status "${status}" (use active, paused, achieved or dropped)`);
			return changeGoal(actor, id, 'goal.set_status', (before) => {
				if (before.status === status) throw new Error(`Goal ${id} is already ${status}`);
				db.prepare('UPDATE goal SET status = ? WHERE id = ?').run(status, id);
			});
		},
		getGoal: snapshot,
		listGoals(opts = {}) {
			const rows = db.prepare('SELECT * FROM goal ORDER BY id').all() as unknown as GoalRow[];
			return rows.map(toGoal).filter((g) => opts.status === undefined || g.status === opts.status);
		},

		addMilestone(actor, goalId, input) {
			const title = cleanTitle(input.title, 'Milestone');
			const targetDate = cleanDate(input.targetDate);
			return atomically(() => {
				snapshot(goalId);
				const { next } = db
					.prepare('SELECT COALESCE(MAX(position), -1) + 1 AS next FROM milestone WHERE goal_id = ?')
					.get(goalId) as { next: number };
				const { lastInsertRowid } = db
					.prepare('INSERT INTO milestone (goal_id, title, target_date, position) VALUES (?, ?, ?, ?)')
					.run(goalId, title, targetDate, next);
				const m = milestone(Number(lastInsertRowid));
				record(actor, 'milestone.create', 'milestone', m.id, null, m);
				return m;
			});
		},
		updateMilestone(actor, id, patch) {
			return changeMilestone(actor, id, 'milestone.update', (before) => {
				const title = patch.title === undefined ? before.title : cleanTitle(patch.title, 'Milestone');
				const targetDate = patch.targetDate === undefined ? before.targetDate : cleanDate(patch.targetDate);
				db.prepare('UPDATE milestone SET title = ?, target_date = ? WHERE id = ?').run(title, targetDate, id);
			});
		},
		setMilestoneDone(actor, id, done) {
			return changeMilestone(actor, id, done ? 'milestone.complete' : 'milestone.uncomplete', (before) => {
				if (before.done === done) throw new Error(`Milestone ${id} is already ${done ? 'done' : 'not done'}`);
				db.prepare('UPDATE milestone SET done = ? WHERE id = ?').run(done ? 1 : 0, id);
			});
		},
		setTaskMilestone(actor, taskId, milestoneId) {
			return atomically(() => {
				const before = readTask(db, taskId);
				if (milestoneId !== null) milestone(milestoneId);
				db.prepare('UPDATE task SET milestone_id = ? WHERE id = ?').run(milestoneId, taskId);
				const after = readTask(db, taskId);
				record(actor, 'task.set_milestone', 'task', taskId, before, after);
				return after;
			});
		},
		linkHabitToGoal(actor, habitId, goalId) {
			const kind = entities.get('habit')!;
			return atomically(() => {
				const before = kind.read(habitId);
				if (!before) throw new Error(`Habit ${habitId} not found`);
				if (goalId !== null) snapshot(goalId);
				db.prepare('UPDATE habit SET goal_id = ? WHERE id = ?').run(goalId, habitId);
				const after = kind.read(habitId) as Habit & { checkins: unknown };
				record(actor, 'habit.set_goal', 'habit', habitId, before, after);
				const { checkins: _c, ...habit } = after;
				return habit;
			});
		},
		goalProgress(opts) {
			if (opts.goalId !== undefined) return [progressOf(plain(snapshot(opts.goalId)))];
			const goals = this.listGoals();
			return goals.filter((g) => opts.includeInactive || g.status === 'active').map(progressOf);
		},
		reorderMilestones(actor, goalId, orderedIds) {
			return atomically(() => {
				const before = snapshot(goalId);
				const current = before.milestones.map((m) => m.id).sort((a, b) => a - b);
				const given = [...orderedIds].sort((a, b) => a - b);
				if (current.length !== given.length || current.some((id, i) => id !== given[i]))
					throw new Error(`Reorder must list every milestone of goal ${goalId} exactly once`);
				orderedIds.forEach((id, i) => db.prepare('UPDATE milestone SET position = ? WHERE id = ?').run(i, id));
				const after = snapshot(goalId);
				record(actor, 'goal.reorder_milestones', 'goal', goalId, before, after);
				return after;
			});
		}
	};
}
