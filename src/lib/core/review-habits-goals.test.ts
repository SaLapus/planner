import { describe, expect, it } from 'vitest';
import { createTestPlanner } from './testing/harness.js';
import type { Planner } from './index.js';

// Home zone is Europe/Istanbul. 2026-01-05 is a Monday.
const checkins = (planner: Planner, habitId: number, dates: string[]) =>
	dates.forEach((date) => planner.addCheckin('owner', habitId, { date }));

describe('reviewData: habits', () => {
	it('weekly habit, week review: one period, its hit-rate, check-ins and streak', () => {
		const { planner, clock } = createTestPlanner({ now: '2025-12-01T09:00:00Z' });
		const gym = planner.createHabit('owner', { title: 'Зал', schedule: { type: 'per_week', count: 3 } });
		clock.set('2026-01-12T09:00:00Z'); // Monday after the week
		checkins(planner, gym.id, ['2025-12-30', '2025-12-31', '2026-01-02']); // previous week: met
		checkins(planner, gym.id, ['2026-01-05', '2026-01-07', '2026-01-09']); // this week: met

		const [h] = planner.reviewData({ period: 'week', date: '2026-01-07' }).habits;
		expect(h.habit.id).toBe(gym.id);
		expect(h.periods).toEqual([{ start: '2026-01-05', end: '2026-01-11', done: 3, target: 3, met: true }]);
		expect(h.hitRate).toBe(100);
		expect(h.checkins).toEqual(['2026-01-05', '2026-01-07', '2026-01-09']);
		expect(h.streak).toBe(2);
	});

	it('a missed week gives hit-rate 0 and a broken streak', () => {
		const { planner, clock } = createTestPlanner({ now: '2025-12-01T09:00:00Z' });
		const gym = planner.createHabit('owner', { title: 'Зал', schedule: { type: 'per_week', count: 3 } });
		clock.set('2026-01-12T09:00:00Z');
		checkins(planner, gym.id, ['2026-01-05']);
		const [h] = planner.reviewData({ period: 'week', date: '2026-01-07' }).habits;
		expect(h.periods[0]).toMatchObject({ done: 1, target: 3, met: false });
		expect(h.hitRate).toBe(0);
		expect(h.streak).toBe(0);
	});

	it('month review: weekly habit is judged over the ISO weeks that END inside the month', () => {
		const { planner, clock } = createTestPlanner({ now: '2025-12-01T09:00:00Z' });
		const gym = planner.createHabit('owner', { title: 'Зал', schedule: { type: 'per_week', count: 2 } });
		clock.set('2026-02-03T09:00:00Z');
		// weeks ending Jan 4, 11, 18, 25 are in January (Feb 1 is not): meet 3 of the 4
		checkins(planner, gym.id, ['2025-12-29', '2026-01-02']); // met (ends Jan 4)
		checkins(planner, gym.id, ['2026-01-05']); // not met (ends Jan 11)
		checkins(planner, gym.id, ['2026-01-12', '2026-01-14']); // met (ends Jan 18)
		checkins(planner, gym.id, ['2026-01-19', '2026-01-20']); // met (ends Jan 25)
		checkins(planner, gym.id, ['2026-01-26', '2026-01-27']); // week ending Feb 1: not part of January

		const [h] = planner.reviewData({ period: 'month', date: '2026-01-20' }).habits;
		expect(h.periods.map((p) => [p.end, p.met])).toEqual([
			['2026-01-04', true],
			['2026-01-11', false],
			['2026-01-18', true],
			['2026-01-25', true]
		]);
		expect(h.hitRate).toBe(75);
		expect(h.checkins).toHaveLength(8); // all check-ins dated in January (not the one on Dec 29)
	});

	it('monthly habit: judged in the month review, no hit-rate in a week review', () => {
		const { planner, clock } = createTestPlanner({ now: '2025-12-01T09:00:00Z' });
		const read = planner.createHabit('owner', { title: 'Чтение', schedule: { type: 'per_month', count: 2 } });
		clock.set('2026-02-03T09:00:00Z');
		checkins(planner, read.id, ['2026-01-10', '2026-01-20']);

		const [m] = planner.reviewData({ period: 'month', date: '2026-01-15' }).habits;
		expect(m.periods).toEqual([{ start: '2026-01-01', end: '2026-01-31', done: 2, target: 2, met: true }]);
		expect(m.hitRate).toBe(100);

		const [w] = planner.reviewData({ period: 'week', date: '2026-01-14' }).habits;
		expect(w.periods).toEqual([]);
		expect(w.hitRate).toBeNull();
	});

	it('does not judge a period that has not ended yet, and skips habits created after the period or archived', () => {
		const { planner, clock } = createTestPlanner({ now: '2026-01-07T09:00:00Z' }); // Wednesday
		const gym = planner.createHabit('owner', { title: 'Зал', schedule: { type: 'per_week', count: 3 } });
		const old = planner.createHabit('owner', { title: 'Старая', schedule: { type: 'per_week', count: 1 } });
		planner.archiveHabit('owner', old.id);
		clock.set('2026-01-13T09:00:00Z');
		planner.createHabit('owner', { title: 'Новая', schedule: { type: 'per_week', count: 1 } });
		clock.set('2026-01-07T09:00:00Z');

		const data = planner.reviewData({ period: 'week' });
		expect(data.habits.map((h) => h.habit.title)).toEqual(['Зал']);
		expect(data.habits[0].periods).toEqual([]); // the week is still open
		expect(data.habits[0].hitRate).toBeNull();
		expect(data.habits[0].habit.id).toBe(gym.id);
	});
});

describe('reviewData: goals', () => {
	it('includes progress of active goals (as of now) with linked milestones, tasks and habits', () => {
		const { planner } = createTestPlanner({ now: '2026-01-12T09:00:00Z' });
		const goal = planner.createGoal('owner', { title: 'Форма' });
		const m1 = planner.addMilestone('owner', goal.id, { title: 'Начать' });
		planner.addMilestone('owner', goal.id, { title: 'Бегать' });
		planner.setMilestoneDone('owner', m1.id, true);
		const paused = planner.createGoal('owner', { title: 'Пауза' });
		planner.setGoalStatus('owner', paused.id, 'paused');

		const data = planner.reviewData({ period: 'week', date: '2026-01-07' });
		expect(data.goals.map((g) => g.goal.title)).toEqual(['Форма']);
		expect(data.goals[0].milestones).toEqual({ done: 1, total: 2, percent: 50 });
	});
});
