import { describe, expect, it } from 'vitest';
import { createTestPlanner } from './testing/harness.js';

type P = ReturnType<typeof createTestPlanner>['planner'];

// Calendar facts used below (independent of the code): 2026-01-05 is a Monday.
// Weeks: Dec 22-28, Dec 29-Jan 4, Jan 5-11, Jan 12-18.
function gym(planner: P, count = 3) {
	return planner.createHabit('owner', { title: 'Зал', schedule: { type: 'per_week', count } });
}
function checkIn(planner: P, id: number, ...dates: string[]) {
	for (const date of dates) planner.addCheckin('owner', id, { date });
}

function removeCheckin(planner: P, actor: 'owner' | 'claude', habitId: number, date: string) {
	const c = planner.checkinOn(habitId, date);
	if (!c) throw new Error(`Habit ${habitId} has no check-in on ${date}`);
	planner.deleteItem(actor, 'checkin', c.id);
}

describe('check-ins', () => {
	it('defaults to today in the Home time zone', () => {
		const { planner } = createTestPlanner({ now: '2026-01-07T09:00:00.000Z' });
		const h = gym(planner);

		const c = planner.addCheckin('owner', h.id, {});

		expect(c).toMatchObject({ habitId: h.id, date: '2026-01-07' });
	});

	it('near midnight, the instant resolves to the right local date', () => {
		// 21:30 UTC = 00:30 the next day in Istanbul (UTC+3), but still 13:30 the same day in Los Angeles.
		const istanbul = createTestPlanner({ now: '2026-01-05T21:30:00.000Z' });
		const h1 = gym(istanbul.planner);
		expect(istanbul.planner.addCheckin('owner', h1.id, {}).date).toBe('2026-01-06');

		const la = createTestPlanner({ now: '2026-01-05T21:30:00.000Z', homeTimeZone: 'America/Los_Angeles' });
		const h2 = gym(la.planner);
		expect(la.planner.addCheckin('owner', h2.id, {}).date).toBe('2026-01-05');

		// An explicit instant is converted the same way (23:30 UTC on Jan 5 is Jan 6 in Istanbul).
		const h3 = gym(istanbul.planner);
		expect(istanbul.planner.addCheckin('owner', h3.id, { date: '2026-01-05T23:30:00Z' }).date).toBe(
			'2026-01-06'
		);
	});

	it('accepts back-dated check-ins, rejects future dates and duplicates', () => {
		const { planner } = createTestPlanner({ now: '2026-01-07T09:00:00.000Z' });
		const h = gym(planner);

		expect(planner.addCheckin('owner', h.id, { date: '2025-12-30' }).date).toBe('2025-12-30');
		expect(() => planner.addCheckin('owner', h.id, { date: '2026-01-08' })).toThrow(/future/);
		expect(() => planner.addCheckin('owner', h.id, { date: '2025-12-30' })).toThrow(/already/);
		expect(() => planner.addCheckin('owner', h.id, { date: 'вчера' })).toThrow(/Invalid date/);
		expect(() => planner.addCheckin('owner', 99, {})).toThrow(/not found/);
		expect(planner.changeLog().filter((e) => e.action === 'checkin.add')).toHaveLength(1);
	});

	it('removes a check-in, and refuses to remove one that is not there', () => {
		const { planner } = createTestPlanner({ now: '2026-01-07T09:00:00.000Z' });
		const h = gym(planner);
		checkIn(planner, h.id, '2026-01-05', '2026-01-06');

		removeCheckin(planner, 'claude', h.id, '2026-01-05');

		expect(planner.habitStatus({}).habits[0].checkins).toEqual(['2026-01-06']);
		expect(() => removeCheckin(planner, 'owner', h.id, '2026-01-05')).toThrow(/no check-in/);
		expect(planner.changeLog().at(-1)).toMatchObject({ actor: 'claude', action: 'checkin.delete' });
	});

	it('a removed date can be checked in again', () => {
		const { planner } = createTestPlanner();
		const h = gym(planner);
		checkIn(planner, h.id, '2026-01-05');
		removeCheckin(planner, 'owner', h.id, '2026-01-05');

		planner.addCheckin('owner', h.id, { date: '2026-01-05' });

		expect(planner.habitStatus({}).habits[0].done).toBe(1);
	});
});

describe('habit status: N per week', () => {
	it('shows progress in the current ISO week (Monday start)', () => {
		const { planner } = createTestPlanner({ now: '2026-01-07T09:00:00.000Z' }); // Wednesday
		const h = gym(planner);
		// Sunday Jan 4 belongs to the PREVIOUS week; Jan 5 (Mon) to the current one.
		checkIn(planner, h.id, '2026-01-04', '2026-01-05', '2026-01-07');

		const s = planner.habitStatus({}).habits[0];

		expect(s).toMatchObject({
			done: 2,
			target: 3,
			met: false,
			open: true,
			period: { type: 'week', start: '2026-01-05', end: '2026-01-11' },
			checkedToday: true
		});
	});

	it('an open period does not break the streak, a met one extends it', () => {
		const { planner } = createTestPlanner({ now: '2026-01-14T09:00:00.000Z' }); // Wed, week Jan 12-18
		const h = gym(planner);
		checkIn(planner, h.id, '2025-12-29', '2025-12-30', '2026-01-02'); // week Dec 29-Jan 4: met
		checkIn(planner, h.id, '2026-01-05', '2026-01-07', '2026-01-09'); // week Jan 5-11: met
		checkIn(planner, h.id, '2026-01-12'); // current week: 1/3, still open

		expect(planner.habitStatus({}).habits[0].streak).toBe(2);

		checkIn(planner, h.id, '2026-01-13', '2026-01-14'); // current week now met
		expect(planner.habitStatus({}).habits[0]).toMatchObject({ streak: 3, met: true });
	});

	it('a closed unmet period breaks the streak', () => {
		const { planner } = createTestPlanner({ now: '2026-01-14T09:00:00.000Z' });
		const h = gym(planner);
		checkIn(planner, h.id, '2025-12-29', '2025-12-30', '2026-01-02'); // met
		checkIn(planner, h.id, '2026-01-05', '2026-01-07'); // only 2/3: broken
		checkIn(planner, h.id, '2026-01-12', '2026-01-13', '2026-01-14'); // current met

		expect(planner.habitStatus({}).habits[0].streak).toBe(1);
	});

	it('back-dating a check-in into a closed week repairs the streak', () => {
		const { planner } = createTestPlanner({ now: '2026-01-14T09:00:00.000Z' });
		const h = gym(planner);
		checkIn(planner, h.id, '2025-12-29', '2025-12-30', '2026-01-02', '2026-01-05', '2026-01-07');
		expect(planner.habitStatus({}).habits[0].streak).toBe(0);

		planner.addCheckin('owner', h.id, { date: '2026-01-09' });

		expect(planner.habitStatus({}).habits[0].streak).toBe(2);
	});

	it('a brand-new habit has progress 0 and streak 0', () => {
		const { planner } = createTestPlanner();
		gym(planner);
		expect(planner.habitStatus({}).habits[0]).toMatchObject({ done: 0, target: 3, streak: 0, met: false });
	});

	it('can look at a past period via `date`', () => {
		const { planner } = createTestPlanner({ now: '2026-01-14T09:00:00.000Z' });
		const h = gym(planner);
		checkIn(planner, h.id, '2025-12-29', '2025-12-30', '2026-01-02', '2026-01-05');

		const past = planner.habitStatus({ date: '2026-01-02' }).habits[0];
		expect(past).toMatchObject({ done: 3, met: true, open: false, streak: 1 });
		expect(past.period.start).toBe('2025-12-29');

		// Week Jan 5-11 is closed and was not met: no streak as of that week.
		expect(planner.habitStatus({ date: '2026-01-08' }).habits[0]).toMatchObject({ done: 1, streak: 0 });
	});
});

describe('habit status: specific weekdays', () => {
	it('is met only when every scheduled weekday is checked', () => {
		const { planner } = createTestPlanner({ now: '2026-01-09T09:00:00.000Z' }); // Friday
		const h = planner.createHabit('owner', { title: 'Зарядка', schedule: { type: 'weekdays', days: [1, 3, 5] } });
		checkIn(planner, h.id, '2026-01-05', '2026-01-06'); // Mon, Tue (Tue is not scheduled)

		expect(planner.habitStatus({}).habits[0]).toMatchObject({ done: 1, target: 3, met: false });

		checkIn(planner, h.id, '2026-01-07', '2026-01-09');
		expect(planner.habitStatus({}).habits[0]).toMatchObject({ done: 3, target: 3, met: true, streak: 1 });
	});

	it('a week with a missed scheduled day ends the streak', () => {
		const { planner } = createTestPlanner({ now: '2026-01-14T09:00:00.000Z' });
		const h = planner.createHabit('owner', { title: 'Зарядка', schedule: { type: 'weekdays', days: [1, 3] } });
		checkIn(planner, h.id, '2025-12-29', '2025-12-31'); // met
		checkIn(planner, h.id, '2026-01-05'); // missed Wednesday: not met

		expect(planner.habitStatus({}).habits[0].streak).toBe(0);
	});
});

describe('habit status: N per month', () => {
	it('uses calendar months and respects month boundaries', () => {
		const { planner } = createTestPlanner({ now: '2026-03-10T09:00:00.000Z' });
		const h = planner.createHabit('owner', { title: 'Отчёт', schedule: { type: 'per_month', count: 2 } });
		// January: Jan 31 only (1 of 2) -> unmet. February: Feb 1 and Feb 28 -> met. March: Mar 1 -> 1/2, open.
		checkIn(planner, h.id, '2026-01-31', '2026-02-01', '2026-02-28', '2026-03-01');

		const s = planner.habitStatus({}).habits[0];

		expect(s).toMatchObject({
			done: 1,
			target: 2,
			open: true,
			streak: 1,
			period: { type: 'month', start: '2026-03-01', end: '2026-03-31' }
		});
		expect(planner.habitStatus({ date: '2026-02-15' }).habits[0]).toMatchObject({
			done: 2,
			met: true,
			period: { start: '2026-02-01', end: '2026-02-28' }
		});
	});

	it('streak runs across a year boundary', () => {
		const { planner } = createTestPlanner({ now: '2026-02-10T09:00:00.000Z' });
		const h = planner.createHabit('owner', { title: 'Отчёт', schedule: { type: 'per_month', count: 1 } });
		checkIn(planner, h.id, '2025-11-30', '2025-12-31', '2026-01-01');

		expect(planner.habitStatus({}).habits[0]).toMatchObject({ met: false, streak: 3 });
	});

	it('the `period` filter keeps only habits of that kind', () => {
		const { planner } = createTestPlanner();
		gym(planner);
		planner.createHabit('owner', { title: 'Отчёт', schedule: { type: 'per_month', count: 2 } });
		planner.createHabit('owner', { title: 'Зарядка', schedule: { type: 'weekdays', days: [1] } });

		expect(planner.habitStatus({ period: 'week' }).habits.map((s) => s.habit.title)).toEqual(['Зал', 'Зарядка']);
		expect(planner.habitStatus({ period: 'month' }).habits.map((s) => s.habit.title)).toEqual(['Отчёт']);
	});
});

describe('listing check-in dates', () => {
	it('returns the dates inside the range, across period boundaries', () => {
		const { planner } = createTestPlanner({ now: '2026-01-14T09:00:00.000Z' });
		const h = gym(planner);
		checkIn(planner, h.id, '2026-01-02', '2026-01-05', '2026-01-12');

		expect(planner.listCheckinDates(h.id, { from: '2026-01-04', to: '2026-01-14' })).toEqual([
			'2026-01-05',
			'2026-01-12'
		]);
	});
});
