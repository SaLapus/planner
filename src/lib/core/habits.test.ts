import { describe, expect, it } from 'vitest';
import { createTestPlanner } from './testing/harness.js';

describe('habits: create, edit, archive', () => {
	it('creates a habit with each of the three schedule types', () => {
		const { planner } = createTestPlanner();

		const a = planner.createHabit('owner', { title: 'Зал', schedule: { type: 'per_week', count: 3 } });
		const b = planner.createHabit('owner', { title: 'Отчёт', schedule: { type: 'per_month', count: 2 } });
		const c = planner.createHabit('owner', {
			title: 'Зарядка',
			schedule: { type: 'weekdays', days: [5, 1, 3] }
		});

		expect(a.schedule).toEqual({ type: 'per_week', count: 3 });
		expect(b.schedule).toEqual({ type: 'per_month', count: 2 });
		expect(c.schedule).toEqual({ type: 'weekdays', days: [1, 3, 5] });
		expect(planner.listHabits().map((h) => h.title)).toEqual(['Зал', 'Отчёт', 'Зарядка']);
	});

	it('rejects empty titles and nonsense schedules without logging', () => {
		const { planner } = createTestPlanner();
		const bad = (input: Parameters<typeof planner.createHabit>[1]) =>
			expect(() => planner.createHabit('owner', input)).toThrow();

		bad({ title: ' ', schedule: { type: 'per_week', count: 3 } });
		bad({ title: 'x', schedule: { type: 'per_week', count: 0 } });
		bad({ title: 'x', schedule: { type: 'per_week', count: 8 } });
		bad({ title: 'x', schedule: { type: 'per_month', count: 32 } });
		bad({ title: 'x', schedule: { type: 'weekdays', days: [] } });
		bad({ title: 'x', schedule: { type: 'weekdays', days: [0, 8] } });
		expect(planner.listHabits()).toEqual([]);
		expect(planner.changeLog()).toEqual([]);
	});

	it('updates title and schedule, logging the actor', () => {
		const { planner } = createTestPlanner();
		const h = planner.createHabit('owner', { title: 'Зал', schedule: { type: 'per_week', count: 3 } });

		const u = planner.updateHabit('claude', h.id, { schedule: { type: 'per_week', count: 4 } });

		expect(u.title).toBe('Зал');
		expect(u.schedule).toEqual({ type: 'per_week', count: 4 });
		const last = planner.changeLog().at(-1)!;
		expect(last.actor).toBe('claude');
		expect(last.action).toBe('habit.update');
	});

	it('archives and unarchives without losing history', () => {
		const { planner } = createTestPlanner();
		const h = planner.createHabit('owner', { title: 'Зал', schedule: { type: 'per_week', count: 3 } });
		planner.addCheckin('owner', h.id, {});

		planner.archiveHabit('owner', h.id);
		expect(planner.listHabits()).toEqual([]);
		expect(planner.listHabits({ includeArchived: true })).toHaveLength(1);
		expect(planner.habitStatus({}).habits).toEqual([]);

		planner.unarchiveHabit('owner', h.id);
		expect(planner.habitStatus({}).habits[0].done).toBe(1);
	});
});

describe('habits: removeCheckin', () => {
	it('moves the Check-in of a date to Trash (restorable) and returns it; errors when there is none', () => {
		const { planner } = createTestPlanner({ now: '2026-01-07T09:00:00.000Z' });
		const h = planner.createHabit('owner', { title: 'Зал', schedule: { type: 'per_week', count: 3 } });
		const c = planner.addCheckin('owner', h.id, { date: '2026-01-06' });

		expect(planner.removeCheckin('claude', h.id, '2026-01-06')).toEqual(c);
		expect(planner.checkinOn(h.id, '2026-01-06')).toBeNull();
		expect(planner.changeLog().at(-1)).toMatchObject({ action: 'checkin.delete', actor: 'claude' });
		expect(() => planner.removeCheckin('claude', h.id, '2026-01-06')).toThrow(/no check-in/i);
		planner.restoreItem('owner', 'checkin', c.id);
		expect(planner.checkinOn(h.id, '2026-01-06')).not.toBeNull();
	});
});
