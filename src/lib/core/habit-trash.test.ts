import { describe, expect, it } from 'vitest';
import { createTestPlanner } from './testing/harness.js';

type P = ReturnType<typeof createTestPlanner>['planner'];

function gym(planner: P) {
	return planner.createHabit('owner', { title: 'Зал', schedule: { type: 'per_week', count: 3 } });
}

describe('Habits in Trash', () => {
	it('deleting a habit hides it and its status; restore brings back habit and check-in history', () => {
		const { planner } = createTestPlanner({ now: '2026-01-07T09:00:00.000Z' });
		const h = gym(planner);
		planner.addCheckin('owner', h.id, { date: '2026-01-05' });
		planner.addCheckin('owner', h.id, { date: '2026-01-06' });

		planner.deleteItem('claude', 'habit', h.id);

		expect(planner.listHabits({ includeArchived: true })).toEqual([]);
		expect(planner.habitStatus({}).habits).toEqual([]);
		expect(planner.listTrash()).toEqual([expect.objectContaining({ entityType: 'habit', label: 'Зал' })]);
		expect(() => planner.addCheckin('owner', h.id, {})).toThrow(/not found/);

		planner.restoreItem('owner', 'habit', h.id);

		const s = planner.habitStatus({}).habits[0];
		expect(s.habit.title).toBe('Зал');
		expect(s.checkins).toEqual(['2026-01-05', '2026-01-06']);
		expect(planner.changeLog().map((e) => e.action).slice(-2)).toEqual(['habit.delete', 'habit.restore']);
	});

	it('a deleted check-in is ignored by status and can be restored', () => {
		const { planner } = createTestPlanner({ now: '2026-01-07T09:00:00.000Z' });
		const h = gym(planner);
		const c = planner.addCheckin('owner', h.id, { date: '2026-01-05' });

		planner.deleteItem('owner', 'checkin', c.id);

		expect(planner.habitStatus({}).habits[0].done).toBe(0);
		expect(planner.listTrash()[0]).toMatchObject({ entityType: 'checkin', label: 'Зал, 2026-01-05' });

		planner.restoreItem('owner', 'checkin', c.id);

		expect(planner.habitStatus({}).habits[0].checkins).toEqual(['2026-01-05']);
	});

	it('refuses to restore a check-in whose habit is in Trash, or whose date was checked in again', () => {
		const { planner } = createTestPlanner({ now: '2026-01-07T09:00:00.000Z' });
		const h = gym(planner);
		const c = planner.addCheckin('owner', h.id, { date: '2026-01-05' });
		planner.deleteItem('owner', 'checkin', c.id);
		planner.addCheckin('owner', h.id, { date: '2026-01-05' });
		expect(() => planner.restoreItem('owner', 'checkin', c.id)).toThrow(/already checked in/);

		const h2 = gym(planner);
		const c2 = planner.addCheckin('owner', h2.id, { date: '2026-01-05' });
		planner.deleteItem('owner', 'checkin', c2.id);
		planner.deleteItem('owner', 'habit', h2.id);
		expect(() => planner.restoreItem('owner', 'checkin', c2.id)).toThrow(/habit/);
	});
});

describe('Undo for Habits and Check-ins', () => {
	it('undoing an add_checkin removes the check-in again', () => {
		const { planner } = createTestPlanner({ now: '2026-01-07T09:00:00.000Z' });
		const h = gym(planner);
		planner.addCheckin('claude', h.id, { date: '2026-01-06' });
		const entry = planner.changeLog().at(-1)!;
		expect(entry.action).toBe('checkin.add');

		planner.undoChange('owner', entry.id);

		expect(planner.habitStatus({}).habits[0].done).toBe(0);
		expect(planner.changeLog().at(-1)!.action).toBe('checkin.add.undo');
	});

	it('undoing a check-in deletion brings it back', () => {
		const { planner } = createTestPlanner({ now: '2026-01-07T09:00:00.000Z' });
		const h = gym(planner);
		const c = planner.addCheckin('owner', h.id, { date: '2026-01-06' });
		planner.deleteItem('claude', 'checkin', c.id);

		planner.undoChange('owner', planner.changeLog().at(-1)!.id);

		expect(planner.habitStatus({}).habits[0].checkins).toEqual(['2026-01-06']);
	});

	it('undoing a habit update restores the old title and schedule; undoing archive unarchives', () => {
		const { planner } = createTestPlanner();
		const h = gym(planner);
		planner.updateHabit('claude', h.id, { title: 'Бассейн', schedule: { type: 'per_month', count: 4 } });
		planner.undoChange('owner', planner.changeLog().at(-1)!.id);
		expect(planner.listHabits()[0]).toMatchObject({ title: 'Зал', schedule: { type: 'per_week', count: 3 } });

		planner.archiveHabit('owner', h.id);
		planner.undoChange('owner', planner.changeLog().at(-1)!.id);
		expect(planner.listHabits()).toHaveLength(1);
	});

	it('undoing a habit creation sends it to Trash; undoing a habit deletion restores its check-ins', () => {
		const { planner } = createTestPlanner({ now: '2026-01-07T09:00:00.000Z' });
		const h = gym(planner);
		const createEntry = planner.changeLog().at(-1)!;
		planner.addCheckin('owner', h.id, { date: '2026-01-06' });
		planner.deleteItem('owner', 'habit', h.id);

		planner.undoChange('owner', planner.changeLog().at(-1)!.id);
		expect(planner.habitStatus({}).habits[0].checkins).toEqual(['2026-01-06']);

		// Check-ins are separate entities: they do not block undoing the creation (= moving the Habit to
		// Trash), and the history comes back with a restore.
		planner.undoChange('owner', createEntry.id);
		expect(planner.listHabits()).toEqual([]);
		planner.restoreItem('owner', 'habit', h.id);
		expect(planner.habitStatus({}).habits[0].checkins).toEqual(['2026-01-06']);
	});

	it('a later Check-in does not block undoing an earlier update or archive, and survives that undo', () => {
		const { planner } = createTestPlanner({ now: '2026-01-07T09:00:00.000Z' });
		const h = gym(planner);
		planner.updateHabit('owner', h.id, { title: 'Бассейн' });
		const update = planner.changeLog().at(-1)!;
		planner.archiveHabit('owner', h.id);
		const archive = planner.changeLog().at(-1)!;
		planner.unarchiveHabit('owner', h.id);
		planner.addCheckin('owner', h.id, { date: '2026-01-06' });

		// Newer Habit changes still block (unarchive came after archive) ...
		expect(() => planner.undoChange('owner', archive.id)).toThrow(/Cannot undo/);
		// ... but Check-ins alone do not.
		planner.undoChange('owner', planner.changeLog().find((e) => e.action === 'habit.unarchive')!.id);
		planner.undoChange('owner', archive.id);
		planner.undoChange('owner', update.id);
		expect(planner.listHabits()[0]).toMatchObject({ title: 'Зал' });
		expect(planner.habitStatus({}).habits[0].checkins).toEqual(['2026-01-06']);
	});

	it('undo of a habit update is refused when the habit changed afterwards', () => {
		const { planner } = createTestPlanner();
		const h = gym(planner);
		planner.updateHabit('owner', h.id, { title: 'A' });
		const first = planner.changeLog().at(-1)!;
		planner.updateHabit('owner', h.id, { title: 'B' });

		expect(() => planner.undoChange('owner', first.id)).toThrow(/Cannot undo change/);
		expect(planner.listHabits()[0].title).toBe('B');
	});
});
