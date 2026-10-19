import { describe, expect, it } from 'vitest';
import { createTestPlanner } from './testing/harness.js';

describe('Goal links and progress', () => {
	it('links a Task to a Milestone and a Habit to a Goal, and unlinks them', () => {
		const { planner } = createTestPlanner();
		const g = planner.createGoal('owner', { title: 'G' });
		const m = planner.addMilestone('owner', g.id, { title: 'M' });
		const t = planner.createTask('owner', { title: 'T' });
		const h = planner.createHabit('owner', { title: 'H', schedule: { type: 'per_week', count: 3 } });

		expect(planner.getTask(t.id).milestoneId).toBeNull();
		expect(planner.setTaskMilestone('owner', t.id, m.id).milestoneId).toBe(m.id);
		expect(planner.linkHabitToGoal('owner', h.id, g.id).goalId).toBe(g.id);
		expect(planner.listHabits()[0].goalId).toBe(g.id);

		planner.setTaskMilestone('owner', t.id, null);
		planner.linkHabitToGoal('owner', h.id, null);
		expect(planner.getTask(t.id).milestoneId).toBeNull();
		expect(planner.listHabits()[0].goalId).toBeNull();

		expect(() => planner.setTaskMilestone('owner', t.id, 999)).toThrow(/Milestone 999/);
		expect(() => planner.linkHabitToGoal('owner', h.id, 999)).toThrow(/Goal 999/);
		expect(planner.changeLog().map((e) => e.action).slice(-4)).toEqual([
			'task.set_milestone',
			'habit.set_goal',
			'task.set_milestone',
			'habit.set_goal'
		]);
	});

	it('progress = done milestones / total, with linked tasks and habits (with habit status)', () => {
		const { planner } = createTestPlanner({ now: '2026-01-07T09:00:00.000Z' }); // Wednesday
		const g = planner.createGoal('owner', { title: 'Форма' });
		const [m1, m2, m3, m4] = ['a', 'b', 'c', 'd'].map((title) => planner.addMilestone('owner', g.id, { title }));
		planner.setMilestoneDone('owner', m1.id, true);

		const t1 = planner.createTask('owner', { title: 'купить кроссовки' });
		const t2 = planner.createTask('owner', { title: 'записаться' });
		planner.createTask('owner', { title: 'не связана' });
		planner.setTaskMilestone('owner', t1.id, m2.id);
		planner.setTaskMilestone('owner', t2.id, m3.id);
		planner.completeTask('owner', t1.id);

		const gym = planner.createHabit('owner', { title: 'Зал', schedule: { type: 'per_week', count: 3 } });
		planner.createHabit('owner', { title: 'чужая', schedule: { type: 'per_week', count: 1 } });
		planner.linkHabitToGoal('owner', gym.id, g.id);
		planner.addCheckin('owner', gym.id, { date: '2026-01-05' });

		const [p] = planner.goalProgress({ goalId: g.id });
		expect(p.goal).toMatchObject({ id: g.id, title: 'Форма' });
		expect(p.milestones).toMatchObject({ done: 1, total: 4, percent: 25 });
		expect(p.milestoneList.map((m) => [m.title, m.done])).toEqual([['a', true], ['b', false], ['c', false], ['d', false]]);
		expect(p.tasks).toMatchObject({ done: 1, total: 2 });
		expect(p.tasks.items.map((i) => [i.task.title, i.milestoneId])).toEqual([
			['купить кроссовки', m2.id],
			['записаться', m3.id]
		]);
		expect(p.habits).toHaveLength(1);
		expect(p.habits[0]).toMatchObject({ habit: { title: 'Зал' }, done: 1, target: 3, met: false });
		void m4;
	});

	it('a Goal without milestones has 0% progress; default query lists active goals only', () => {
		const { planner } = createTestPlanner();
		const a = planner.createGoal('owner', { title: 'A' });
		const b = planner.createGoal('owner', { title: 'B' });
		planner.setGoalStatus('owner', b.id, 'dropped');

		expect(planner.goalProgress({}).map((p) => p.goal.id)).toEqual([a.id]);
		expect(planner.goalProgress({})[0].milestones).toEqual({ done: 0, total: 0, percent: 0 });
		expect(planner.goalProgress({ includeInactive: true }).map((p) => p.goal.id)).toEqual([a.id, b.id]);
		expect(() => planner.goalProgress({ goalId: 999 })).toThrow(/Goal 999/);
	});
});
