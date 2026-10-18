import { describe, expect, it } from 'vitest';
import { createTestConnector, toolJson } from '../testing/harness.js';

describe('Habit tools over MCP', () => {
	it('creates a habit, checks in (incl. back-dated) and reports status, all as actor claude', async () => {
		const t = createTestConnector();
		const claude = await t.connectClaude();
		t.clock.set('2026-01-14T09:00:00.000Z'); // Wednesday

		const habit = toolJson<{ id: number }>(
			await claude.callTool({
				name: 'create_habit',
				arguments: { title: 'Зал', schedule: { type: 'per_week', count: 3 } }
			})
		);
		for (const date of ['2026-01-05', '2026-01-07', '2026-01-09', '2026-01-12']) {
			await claude.callTool({ name: 'add_checkin', arguments: { habitId: habit.id, date } });
		}

		const status = toolJson<{ habits: { done: number; target: number; streak: number }[] }>(
			await claude.callTool({ name: 'get_habit_status', arguments: { period: 'week' } })
		);

		expect(status.habits).toEqual([expect.objectContaining({ done: 1, target: 3, streak: 1 })]);
		expect(t.planner.changeLog().map((e) => [e.actor, e.action])).toEqual([
			['claude', 'habit.create'],
			['claude', 'checkin.add'],
			['claude', 'checkin.add'],
			['claude', 'checkin.add'],
			['claude', 'checkin.add']
		]);
	});

	it('remove_checkin goes to Trash and is restorable via the generic tools; errors are tool errors', async () => {
		const t = createTestConnector();
		const claude = await t.connectClaude();
		const habit = toolJson<{ id: number }>(
			await claude.callTool({
				name: 'create_habit',
				arguments: { title: 'x', schedule: { type: 'weekdays', days: [1, 3] } }
			})
		);
		const checkin = toolJson<{ id: number }>(
			await claude.callTool({ name: 'add_checkin', arguments: { habitId: habit.id } })
		);

		await claude.callTool({ name: 'remove_checkin', arguments: { habitId: habit.id } });
		expect(t.planner.habitStatus({}).habits[0].done).toBe(0);
		await claude.callTool({ name: 'restore_item', arguments: { type: 'checkin', id: checkin.id } });
		expect(t.planner.habitStatus({}).habits[0].checkins).toHaveLength(1);

		await claude.callTool({ name: 'delete_item', arguments: { type: 'habit', id: habit.id } });
		expect(t.planner.listHabits()).toEqual([]);

		const bad = await claude.callTool({ name: 'add_checkin', arguments: { habitId: 999 } });
		expect(bad.isError).toBe(true);
		const none = await claude.callTool({ name: 'remove_checkin', arguments: { habitId: habit.id } });
		expect(none.isError).toBe(true);
	});

	it('undo_change reverts an add_checkin', async () => {
		const t = createTestConnector();
		const claude = await t.connectClaude();
		const habit = toolJson<{ id: number }>(
			await claude.callTool({
				name: 'create_habit',
				arguments: { title: 'x', schedule: { type: 'per_week', count: 2 } }
			})
		);
		await claude.callTool({ name: 'add_checkin', arguments: { habitId: habit.id } });
		const entry = t.planner.changeLog().at(-1)!;

		await claude.callTool({ name: 'undo_change', arguments: { id: entry.id } });

		expect(t.planner.habitStatus({}).habits[0].done).toBe(0);
	});
});
