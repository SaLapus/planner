import { describe, expect, it } from 'vitest';
import { createTestPlanner } from './testing/harness.js';

// Home zone Europe/Istanbul = UTC+3.
describe('Time block on a Task', () => {
	it('a Task has no Time block by default', () => {
		const { planner } = createTestPlanner();
		expect(planner.createTask('owner', { title: 'x' }).timeBlock).toBeNull();
	});

	it('can be set at creation: Home wall-clock start is stored as a UTC instant', () => {
		const { planner } = createTestPlanner();
		const t = planner.createTask('owner', {
			title: 'Глубокая работа',
			timeBlock: { start: '2026-03-30T10:00', minutes: 90 }
		});
		expect(t.timeBlock).toEqual({ start: '2026-03-30T07:00:00Z', minutes: 90 });
	});

	it('a start with an offset is absolute', () => {
		const { planner } = createTestPlanner();
		const t = planner.createTask('owner', {
			title: 'x',
			timeBlock: { start: '2026-03-30T10:00:00+05:00', minutes: 30 }
		});
		expect(t.timeBlock).toEqual({ start: '2026-03-30T05:00:00Z', minutes: 30 });
	});

	it('can be set and cleared with updateTask; other fields stay', () => {
		const { planner } = createTestPlanner();
		const t = planner.createTask('owner', { title: 'x', due: '2026-03-30', priority: 'high' });
		const blocked = planner.updateTask('owner', t.id, {
			timeBlock: { start: '2026-03-30T14:00', minutes: 60 }
		});
		expect(blocked).toMatchObject({ dueDate: '2026-03-30', priority: 'high' });
		expect(blocked.timeBlock).toEqual({ start: '2026-03-30T11:00:00Z', minutes: 60 });

		// an update that does not mention the block leaves it alone
		expect(planner.updateTask('owner', t.id, { title: 'y' }).timeBlock).not.toBeNull();

		expect(planner.updateTask('owner', t.id, { timeBlock: null }).timeBlock).toBeNull();
	});

	it('rejects a bad start or a bad duration', () => {
		const { planner } = createTestPlanner();
		const make = (timeBlock: { start: string; minutes: number }) =>
			planner.createTask('owner', { title: 'x', timeBlock });
		expect(() => make({ start: 'noon', minutes: 30 })).toThrow(/time block/i);
		expect(() => make({ start: '2026-03-30', minutes: 30 })).toThrow(/time block/i);
		expect(() => make({ start: '2026-03-30T10:00', minutes: 0 })).toThrow(/time block/i);
		expect(() => make({ start: '2026-03-30T10:00', minutes: 1.5 })).toThrow(/time block/i);
		expect(() => make({ start: '2026-03-30T10:00', minutes: 24 * 60 + 1 })).toThrow(/time block/i);
	});

	it('survives Trash and restore, and undo of an update', () => {
		const { planner } = createTestPlanner();
		const t = planner.createTask('owner', {
			title: 'x',
			timeBlock: { start: '2026-03-30T10:00', minutes: 45 }
		});
		planner.deleteItem('owner', 'task', t.id);
		planner.restoreItem('owner', 'task', t.id);
		expect(planner.getTask(t.id).timeBlock).toEqual({ start: '2026-03-30T07:00:00Z', minutes: 45 });

		planner.updateTask('owner', t.id, { timeBlock: null });
		const entry = planner.changeLog().find((c) => c.action === 'task.update')!;
		planner.undoChange('owner', entry.id);
		expect(planner.getTask(t.id).timeBlock).toEqual({ start: '2026-03-30T07:00:00Z', minutes: 45 });
	});
});
