import { describe, expect, it } from 'vitest';
import { createTestPlanner } from './testing/harness.js';

// Home zone Europe/Istanbul = UTC+3. 2026-03-30 is a Monday.
describe('repeat keeps the Start date gap', () => {
	it('fixed: the next Start date moves with the due date', () => {
		const { planner } = createTestPlanner({ now: '2026-03-27T08:00:00Z' });
		const t = planner.createTask('owner', {
			title: 'x',
			due: '2026-03-30',
			start: '2026-03-27',
			repeat: { type: 'fixed', rrule: 'FREQ=WEEKLY;BYDAY=MO' }
		});
		const next = planner.getTask(planner.completeTask('owner', t.id).nextId!);
		expect(next).toMatchObject({ dueDate: '2026-04-06', startDate: '2026-04-03' });
	});

	it('after completion: the gap is kept relative to the new due date', () => {
		const { planner } = createTestPlanner({ now: '2026-03-27T08:00:00Z' });
		const t = planner.createTask('owner', {
			title: 'x',
			due: '2026-03-30',
			start: '2026-03-27',
			repeat: { type: 'after', every: 2, unit: 'week' }
		});
		const next = planner.getTask(planner.completeTask('owner', t.id).nextId!);
		expect(next).toMatchObject({ dueDate: '2026-04-10', startDate: '2026-04-07' });
	});

	it('no due date: the Start date moves by the repeat interval', () => {
		const { planner } = createTestPlanner({ now: '2026-03-27T08:00:00Z' });
		const t = planner.createTask('owner', {
			title: 'x',
			start: '2026-03-25',
			repeat: { type: 'after', every: 3, unit: 'day' }
		});
		const next = planner.getTask(planner.completeTask('owner', t.id).nextId!);
		expect(next.startDate).toBe('2026-03-28');
	});

	it('unticking leaves the Start date unchanged', () => {
		const { planner } = createTestPlanner({ now: '2026-03-27T08:00:00Z' });
		const t = planner.createTask('owner', {
			title: 'x',
			due: '2026-03-30',
			start: '2026-03-27',
			repeat: { type: 'fixed', rrule: 'FREQ=WEEKLY;BYDAY=MO' }
		});
		planner.completeTask('owner', t.id);
		const back = planner.uncompleteTask('owner', t.id);
		expect(back.completedAt).toBeNull();
		expect(back.startDate).toBe('2026-03-27');
	});
});
