import { describe, expect, it } from 'vitest';
import { createTestPlanner } from './testing/harness.js';

// Home zone Europe/Istanbul = UTC+3. The fake clock starts at 2026-01-05T09:00Z (Home day 2026-01-05).
describe('Start date', () => {
	it('defaults to the creation day, or the due date if that is earlier', () => {
		const { planner } = createTestPlanner();
		expect(planner.createTask('owner', { title: 'a' }).startDate).toBe('2026-01-05');
		expect(planner.createTask('owner', { title: 'b', due: '2026-02-01' }).startDate).toBe('2026-01-05');
		expect(planner.createTask('owner', { title: 'c', due: '2026-01-02' }).startDate).toBe('2026-01-02');
	});

	it('uses the Home day for the creation day', () => {
		const { planner } = createTestPlanner({ now: '2026-01-05T22:30:00Z' });
		expect(planner.createTask('owner', { title: 'a' }).startDate).toBe('2026-01-06');
	});

	it('takes an explicit Start date', () => {
		const { planner } = createTestPlanner();
		const t = planner.createTask('owner', { title: 'a', due: '2026-02-01', start: '2026-01-20' });
		expect(t.startDate).toBe('2026-01-20');
	});

	it('rejects a Start date after the due date, allows equal, rejects bad text', () => {
		const { planner } = createTestPlanner();
		expect(() =>
			planner.createTask('owner', { title: 'a', due: '2026-02-01', start: '2026-02-02' })
		).toThrow(/start date.*due/i);
		expect(
			planner.createTask('owner', { title: 'a', due: '2026-02-01T10:00', start: '2026-02-01' }).startDate
		).toBe('2026-02-01');
		expect(() => planner.createTask('owner', { title: 'a', start: 'soon' })).toThrow(/start date/i);
		expect(() => planner.createTask('owner', { title: 'a', start: '2026-02-30' })).toThrow(/start date/i);
		expect(planner.changeLog()).toHaveLength(1);
	});

	it('updates the Start date and rejects a conflicting one', () => {
		const { planner } = createTestPlanner();
		const t = planner.createTask('owner', { title: 'a', due: '2026-02-01' });
		expect(planner.updateTask('owner', t.id, { start: '2026-01-10' }).startDate).toBe('2026-01-10');
		expect(() => planner.updateTask('owner', t.id, { start: '2026-03-01' })).toThrow(/start date/i);
		expect(planner.getTask(t.id).startDate).toBe('2026-01-10');
	});

	it('resets to the default rule when cleared, using the creation day and current due date', () => {
		const { planner, clock } = createTestPlanner();
		const t = planner.createTask('owner', { title: 'a', due: '2026-02-01', start: '2026-01-20' });
		clock.set('2026-01-15T09:00:00Z');
		expect(planner.updateTask('owner', t.id, { start: null }).startDate).toBe('2026-01-05');
		planner.updateTask('owner', t.id, { start: '2026-01-20' });
		expect(planner.updateTask('owner', t.id, { start: null, due: '2026-01-03' }).startDate).toBe(
			'2026-01-03'
		);
	});

	it('moves the Start date back when only the due date moves before it', () => {
		const { planner } = createTestPlanner();
		const t = planner.createTask('owner', { title: 'a', due: '2026-02-01', start: '2026-01-20' });
		expect(planner.updateTask('owner', t.id, { due: '2026-01-25' }).startDate).toBe('2026-01-20');
		expect(planner.updateTask('owner', t.id, { due: '2026-01-12' }).startDate).toBe('2026-01-12');
		expect(planner.updateTask('owner', t.id, { due: null }).startDate).toBe('2026-01-12');
	});

	it('errors when both are given and conflict', () => {
		const { planner } = createTestPlanner();
		const t = planner.createTask('owner', { title: 'a', due: '2026-02-01' });
		expect(() => planner.updateTask('owner', t.id, { due: '2026-01-12', start: '2026-01-20' })).toThrow(
			/start date/i
		);
	});

	it('logs Start date changes and undoes them', () => {
		const { planner } = createTestPlanner();
		const t = planner.createTask('owner', { title: 'a', due: '2026-02-01' });
		planner.updateTask('owner', t.id, { start: '2026-01-20' });
		const entry = planner.changeLog().at(-1)!;
		expect(entry).toMatchObject({ before: { startDate: '2026-01-05' }, after: { startDate: '2026-01-20' } });
		planner.undoChange('owner', entry.id);
		expect(planner.getTask(t.id).startDate).toBe('2026-01-05');
	});

	it('keeps the Start date through Trash', () => {
		const { planner } = createTestPlanner();
		const t = planner.createTask('owner', { title: 'a', due: '2026-02-01', start: '2026-01-20' });
		planner.deleteItem('owner', 'task', t.id);
		planner.restoreItem('owner', 'task', t.id);
		expect(planner.getTask(t.id).startDate).toBe('2026-01-20');
	});

	it('applies the default rule for snapshots taken before the feature (undo and restore)', () => {
		const { planner, db } = createTestPlanner();
		const t = planner.createTask('owner', { title: 'a', due: '2026-02-01', start: '2026-01-20' });
		planner.updateTask('owner', t.id, { title: 'b' });
		const strip = (s: string | null) => {
			if (s === null) return null;
			const o = JSON.parse(s);
			delete o.startDate;
			return JSON.stringify(o);
		};
		// Rewrite the stored "before" snapshots so they look like they predate the Start date.
		const rows = db.prepare('SELECT id, before FROM change_log').all() as {
			id: number;
			before: string | null;
		}[];
		for (const r of rows) {
			db.prepare('UPDATE change_log SET before = ? WHERE id = ?').run(strip(r.before), r.id);
		}
		planner.undoChange('owner', planner.changeLog().at(-1)!.id);
		expect(planner.getTask(t.id)).toMatchObject({ title: 'a', startDate: '2026-01-05' });

		planner.deleteItem('owner', 'task', t.id);
		const snap = db.prepare('SELECT snapshot FROM trash').get() as { snapshot: string };
		db.prepare('UPDATE trash SET snapshot = ?').run(strip(snap.snapshot));
		planner.restoreItem('owner', 'task', t.id);
		expect(planner.getTask(t.id).startDate).toBe('2026-01-05');
	});
});
