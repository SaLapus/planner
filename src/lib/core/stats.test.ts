import { describe, expect, it } from 'vitest';
import { createTestPlanner } from './testing/harness.js';

// Calendar facts (independent of the code): 2026-01-05 is a Monday.
// Weeks: Dec 15-21, Dec 22-28, Dec 29-Jan 4, Jan 5-11.
describe('stats: habit hit-rates', () => {
	it('lists the last periods oldest first, with done/target per period', () => {
		const { planner, clock } = createTestPlanner({ now: '2025-12-20T09:00:00.000Z' });
		const h = planner.createHabit('owner', { title: 'Зал', schedule: { type: 'per_week', count: 2 } });
		clock.set('2026-01-07T09:00:00.000Z');
		for (const date of ['2025-12-23', '2025-12-25', '2025-12-30', '2026-01-06'])
			planner.addCheckin('owner', h.id, { date });

		const { habits } = planner.stats({ periods: 3 });

		expect(habits).toHaveLength(1);
		expect(habits[0].habit.id).toBe(h.id);
		expect(habits[0].periods.map((p) => [p.start, p.done, p.target, p.met, p.open])).toEqual([
			['2025-12-22', 2, 2, true, false],
			['2025-12-29', 1, 2, false, false],
			['2026-01-05', 1, 2, false, true]
		]);
		// The open period is not held against the rate: 1 met of 2 closed periods.
		expect(habits[0].hitRate).toBe(50);
	});

	it('does not count Periods from before the Habit existed as unmet', () => {
		const { planner } = createTestPlanner({ now: '2026-01-07T09:00:00.000Z' });
		planner.createHabit('owner', { title: 'Новая', schedule: { type: 'per_week', count: 2 } });

		const [h] = planner.stats({ periods: 4 }).habits;

		expect(h.periods.map((p) => [p.start, p.open])).toEqual([['2026-01-05', true]]);
		expect(h.hitRate).toBeNull();
	});

	it('uses months for per-month habits and skips archived ones', () => {
		const { planner, clock } = createTestPlanner({ now: '2026-01-02T09:00:00.000Z' });
		const m = planner.createHabit('owner', { title: 'Звонок', schedule: { type: 'per_month', count: 1 } });
		const old = planner.createHabit('owner', { title: 'Старое', schedule: { type: 'per_week', count: 1 } });
		planner.archiveHabit('owner', old.id);
		clock.set('2026-02-10T09:00:00.000Z');
		planner.addCheckin('owner', m.id, { date: '2026-01-15' });

		const { habits } = planner.stats({ periods: 2 });

		expect(habits.map((h) => h.habit.title)).toEqual(['Звонок']);
		expect(habits[0].periods.map((p) => [p.start, p.met])).toEqual([
			['2026-01-01', true],
			['2026-02-01', false]
		]);
		expect(habits[0].hitRate).toBe(100);
	});
});

describe('stats: tasks completed per week', () => {
	it('counts completions per Monday-start week in the Home zone, zero weeks included', () => {
		const { planner, clock } = createTestPlanner({ now: '2025-12-30T10:00:00.000Z' });
		const a = planner.createTask('owner', { title: 'a' });
		const b = planner.createTask('owner', { title: 'b' });
		const c = planner.createTask('owner', { title: 'c' });
		planner.completeTask('owner', a.id); // week of Dec 29
		clock.set('2026-01-04T21:30:00.000Z'); // 00:30 Monday Jan 5 in Istanbul: a new week
		planner.completeTask('owner', b.id);
		clock.set('2026-01-07T09:00:00.000Z');
		planner.completeTask('owner', c.id);

		const { tasksPerWeek } = planner.stats({ weeks: 3 });

		expect(tasksPerWeek.map((w) => [w.start, w.count])).toEqual([
			['2025-12-22', 0],
			['2025-12-29', 1],
			['2026-01-05', 2]
		]);
	});

	it('does not count tasks that were un-completed', () => {
		const { planner } = createTestPlanner({ now: '2026-01-07T09:00:00.000Z' });
		const a = planner.createTask('owner', { title: 'a' });
		planner.completeTask('owner', a.id);
		planner.uncompleteTask('owner', a.id);

		expect(planner.stats({ weeks: 1 }).tasksPerWeek[0].count).toBe(0);
	});
});

describe('stats: goal progress overview', () => {
	it('includes progress of active goals', () => {
		const { planner } = createTestPlanner();
		const g = planner.createGoal('owner', { title: 'Марафон' });
		const m = planner.addMilestone('owner', g.id, { title: '5 км' });
		planner.addMilestone('owner', g.id, { title: '10 км' });
		planner.setMilestoneDone('owner', m.id, true);

		const { goals } = planner.stats({});

		expect(goals.map((p) => [p.goal.title, p.milestones.done, p.milestones.total, p.milestones.percent])).toEqual([
			['Марафон', 1, 2, 50]
		]);
	});
});
