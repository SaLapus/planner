import { describe, expect, it } from 'vitest';
import { createTestPlanner } from './testing/harness.js';

// Home zone is Europe/Istanbul (UTC+3, no DST). 2026-01-05 is a Monday.
describe('reviewData: tasks done', () => {
	it('describes the week as ISO Monday..Sunday in the Home zone', () => {
		const { planner } = createTestPlanner({ now: '2026-01-11T18:00:00Z' }); // Sunday
		const data = planner.reviewData({ period: 'week' });
		expect(data.period).toEqual({ type: 'week', start: '2026-01-05', end: '2026-01-11' });
	});

	it('describes a month as a calendar month, for any date inside it', () => {
		const { planner } = createTestPlanner();
		const data = planner.reviewData({ period: 'month', date: '2026-02-17' });
		expect(data.period).toEqual({ type: 'month', start: '2026-02-01', end: '2026-02-28' });
	});

	it('counts a task as done in the week where it was completed, judged by the Home-zone date', () => {
		const { planner, clock } = createTestPlanner();
		const inWeek = planner.createTask('owner', { title: 'in week' });
		const lateSunday = planner.createTask('owner', { title: 'late sunday' });
		const afterMidnight = planner.createTask('owner', { title: 'after midnight' });
		const before = planner.createTask('owner', { title: 'before' });

		clock.set('2026-01-04T20:59:00Z'); // Sunday 23:59 local: previous week
		planner.completeTask('owner', before.id);
		clock.set('2026-01-04T21:00:00Z'); // Monday 00:00 local: first moment of the week
		planner.completeTask('owner', inWeek.id);
		clock.set('2026-01-11T20:59:00Z'); // Sunday 23:59 local: last moment
		planner.completeTask('owner', lateSunday.id);
		clock.set('2026-01-11T21:00:00Z'); // Monday 00:00 local: next week
		planner.completeTask('owner', afterMidnight.id);

		const data = planner.reviewData({ period: 'week', date: '2026-01-07' });
		expect(data.tasks.done.map((t) => t.title)).toEqual(['in week', 'late sunday']);
	});
});
