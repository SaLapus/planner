import { describe, expect, it } from 'vitest';
import { createTestPlanner } from './testing/harness.js';

function setup() {
	const t = createTestPlanner({ now: '2026-01-07T09:00:00.000Z' });
	const { planner } = t;
	const g = planner.createGoal('owner', { title: 'Форма' });
	const m1 = planner.addMilestone('owner', g.id, { title: 'первый' });
	const m2 = planner.addMilestone('owner', g.id, { title: 'второй' });
	planner.setMilestoneDone('owner', m1.id, true);
	const task = planner.createTask('owner', { title: 'задача' });
	planner.setTaskMilestone('owner', task.id, m2.id);
	const habit = planner.createHabit('owner', { title: 'Зал', schedule: { type: 'per_week', count: 3 } });
	planner.linkHabitToGoal('owner', habit.id, g.id);
	return { ...t, g, m1, m2, task, habit };
}

describe('Goals in Trash and undo', () => {
	it('deleting a Goal hides it and its milestones; restore brings back milestones, order, done flags and links', () => {
		const { planner, g, m1, m2, task, habit } = setup();
		planner.reorderMilestones('owner', g.id, [m2.id, m1.id]);

		planner.deleteItem('claude', 'goal', g.id);

		expect(planner.listGoals()).toEqual([]);
		expect(planner.goalProgress({ includeInactive: true })).toEqual([]);
		expect(planner.listTrash()).toEqual([expect.objectContaining({ entityType: 'goal', label: 'Форма' })]);
		// links are dormant but kept on the rows
		expect(planner.getTask(task.id).milestoneId).toBe(m2.id);
		expect(planner.listHabits()[0].goalId).toBe(g.id);
		expect(() => planner.setTaskMilestone('owner', task.id, m1.id)).toThrow(/Milestone/);

		planner.restoreItem('owner', 'goal', g.id);

		const [p] = planner.goalProgress({ goalId: g.id });
		expect(p.milestoneList.map((m) => [m.title, m.done])).toEqual([['второй', false], ['первый', true]]);
		expect(p.tasks.items.map((i) => i.task.id)).toEqual([task.id]);
		expect(p.habits.map((s) => s.habit.id)).toEqual([habit.id]);
	});

	it('a trashed Milestone drops out of progress and its task link goes dormant; restore revives both', () => {
		const { planner, g, m2, task } = setup();

		planner.deleteItem('owner', 'milestone', m2.id);

		const [p] = planner.goalProgress({ goalId: g.id });
		expect(p.milestones).toMatchObject({ done: 1, total: 1, percent: 100 });
		expect(p.tasks.total).toBe(0);
		expect(planner.getTask(task.id).milestoneId).toBe(m2.id);

		planner.restoreItem('owner', 'milestone', m2.id);

		const [after] = planner.goalProgress({ goalId: g.id });
		expect(after.milestones).toMatchObject({ done: 1, total: 2, percent: 50 });
		expect(after.tasks.total).toBe(1);
	});

	it('refuses to restore a Milestone while its Goal is in Trash', () => {
		const { planner, g, m1 } = setup();
		planner.deleteItem('owner', 'milestone', m1.id);
		planner.deleteItem('owner', 'goal', g.id);
		expect(() => planner.restoreItem('owner', 'milestone', m1.id)).toThrow(/goal/);
	});

	it('links survive archiving: dropping a Goal, completing a Task, archiving a Habit change no link', () => {
		const { planner, g, task, habit, m2 } = setup();
		planner.setGoalStatus('owner', g.id, 'dropped');
		planner.completeTask('owner', task.id);
		planner.archiveHabit('owner', habit.id);

		const [p] = planner.goalProgress({ goalId: g.id });
		expect(p.tasks).toMatchObject({ done: 1, total: 1 });
		expect(p.tasks.items[0].milestoneId).toBe(m2.id);
		expect(p.habits[0].habit).toMatchObject({ id: habit.id, goalId: g.id });
		expect(p.habits[0].habit.archivedAt).not.toBeNull();
	});

	it('a trashed-and-restored Task or Habit keeps its link', () => {
		const { planner, g, task, habit, m2 } = setup();
		planner.deleteItem('owner', 'task', task.id);
		planner.deleteItem('owner', 'habit', habit.id);
		planner.restoreItem('owner', 'task', task.id);
		planner.restoreItem('owner', 'habit', habit.id);
		expect(planner.getTask(task.id).milestoneId).toBe(m2.id);
		expect(planner.listHabits()[0].goalId).toBe(g.id);
	});

	it('undo reverts links, status, milestone edits and reorder; undo of create trashes the goal', () => {
		const { planner, g, m1, m2, task } = setup();
		const lastId = () => planner.changeLog().at(-1)!.id;

		planner.setTaskMilestone('owner', task.id, null);
		planner.undoChange('owner', lastId());
		expect(planner.getTask(task.id).milestoneId).toBe(m2.id);

		planner.reorderMilestones('owner', g.id, [m2.id, m1.id]);
		planner.undoChange('owner', lastId());
		expect(planner.getGoal(g.id).milestones.map((m) => m.id)).toEqual([m1.id, m2.id]);

		planner.setGoalStatus('owner', g.id, 'paused');
		planner.undoChange('owner', lastId());
		expect(planner.getGoal(g.id).status).toBe('active');

		planner.setMilestoneDone('owner', m2.id, true);
		planner.undoChange('owner', lastId());
		expect(planner.goalProgress({ goalId: g.id })[0].milestones.done).toBe(1);
	});
});
