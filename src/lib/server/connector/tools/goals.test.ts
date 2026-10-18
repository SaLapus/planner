import { describe, expect, it } from 'vitest';
import { createTestConnector, toolJson } from '../testing/harness.js';

describe('Goal tools over MCP', () => {
	it('creates goals and milestones, links a task and a habit, and reports progress, all as actor claude', async () => {
		const t = createTestConnector();
		const claude = await t.connectClaude();
		const call = async <T>(name: string, args: Record<string, unknown>) =>
			toolJson<T>(await claude.callTool({ name, arguments: args }));

		const goal = await call<{ id: number }>('create_goal', { title: 'Форма', targetDate: '2026-12-31' });
		const m1 = await call<{ id: number }>('add_milestone', { goalId: goal.id, title: 'первый' });
		const m2 = await call<{ id: number }>('add_milestone', { goalId: goal.id, title: 'второй' });
		await call('set_milestone_done', { id: m1.id, done: true });
		await call('reorder_milestones', { goalId: goal.id, orderedIds: [m2.id, m1.id] });
		await call('set_goal_status', { id: goal.id, status: 'paused' });
		await call('set_goal_status', { id: goal.id, status: 'active' });

		const task = await call<{ id: number }>('create_task', { title: 'бегать' });
		await call('link_task_to_milestone', { taskId: task.id, milestoneId: m2.id });
		const habit = await call<{ id: number }>('create_habit', {
			title: 'Зал',
			schedule: { type: 'per_week', count: 3 }
		});
		await call('link_habit_to_goal', { habitId: habit.id, goalId: goal.id });

		const [p] = await call<
			{
				milestones: { done: number; total: number; percent: number };
				milestoneList: { title: string }[];
				tasks: { total: number };
				habits: { target: number }[];
			}[]
		>('get_goal_progress', { goalId: goal.id });
		expect(p.milestones).toEqual({ done: 1, total: 2, percent: 50 });
		expect(p.milestoneList.map((m) => m.title)).toEqual(['второй', 'первый']);
		expect(p.tasks.total).toBe(1);
		expect(p.habits[0].target).toBe(3);
		expect(new Set(t.planner.changeLog().map((e) => e.actor))).toEqual(new Set(['claude']));

		await call('link_task_to_milestone', { taskId: task.id, milestoneId: null });
		expect((await call<{ tasks: { total: number } }[]>('get_goal_progress', {}))[0].tasks.total).toBe(0);
	});

	it('goals use the generic trash tools, and rule violations are tool errors', async () => {
		const t = createTestConnector();
		const claude = await t.connectClaude();
		const goal = toolJson<{ id: number }>(await claude.callTool({ name: 'create_goal', arguments: { title: 'G' } }));

		await claude.callTool({ name: 'delete_item', arguments: { type: 'goal', id: goal.id } });
		expect(t.planner.listGoals()).toEqual([]);
		await claude.callTool({ name: 'restore_item', arguments: { type: 'goal', id: goal.id } });
		expect(t.planner.listGoals()).toHaveLength(1);

		const bad = await claude.callTool({ name: 'set_goal_status', arguments: { id: goal.id, status: 'active' } });
		expect(bad.isError).toBe(true);
	});
});
