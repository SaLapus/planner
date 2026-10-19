import { describe, expect, it } from 'vitest';
import { createTestPlanner } from './testing/harness.js';

const DAY = 24 * 60 * 60 * 1000;

describe('Trash', () => {
	it('delete moves a task to Trash and logs one entry', () => {
		const { planner } = createTestPlanner();
		const task = planner.createTask('owner', { title: 'Buy milk' });

		planner.deleteItem('owner', 'task', task.id);

		expect(planner.listTasks()).toEqual([]);
		const trash = planner.listTrash();
		expect(trash).toHaveLength(1);
		expect(trash[0]).toMatchObject({ entityType: 'task', entityId: task.id, label: 'Buy milk' });
		const last = planner.changeLog().at(-1)!;
		expect(last).toMatchObject({ action: 'task.delete', actor: 'owner', after: null });
		expect(last.before).toMatchObject({ title: 'Buy milk' });
	});

	it('restore brings the task back unchanged and empties Trash', () => {
		const { planner } = createTestPlanner();
		const task = planner.createTask('owner', { title: 'Buy milk' });
		planner.completeTask('owner', task.id);
		const done = planner.listTasks()[0];
		planner.deleteItem('owner', 'task', task.id);

		planner.restoreItem('claude', 'task', task.id);

		expect(planner.listTasks()).toEqual([done]);
		expect(planner.listTrash()).toEqual([]);
		expect(planner.changeLog().at(-1)).toMatchObject({ action: 'task.restore', actor: 'claude' });
	});

	it('refuses to delete a missing item, to restore what is not in Trash, and unknown types', () => {
		const { planner } = createTestPlanner();
		expect(() => planner.deleteItem('owner', 'task', 99)).toThrow(/not found/);
		expect(() => planner.restoreItem('owner', 'task', 99)).toThrow(/not in Trash/);
		expect(() => planner.deleteItem('owner', 'nope', 1)).toThrow(/Unknown entity type/);
		expect(planner.changeLog()).toEqual([]);
	});

	it('purges items after 30 days, driven by the Clock', () => {
		const { planner, clock } = createTestPlanner();
		const task = planner.createTask('owner', { title: 'Old' });
		planner.deleteItem('owner', 'task', task.id);

		clock.advance(30 * DAY - 1);
		expect(planner.purgeTrash()).toBe(0);
		expect(planner.listTrash()).toHaveLength(1);

		clock.advance(1);
		expect(planner.purgeTrash()).toBe(1);
		expect(planner.listTrash()).toEqual([]);
		expect(() => planner.restoreItem('owner', 'task', task.id)).toThrow(/not in Trash/);
	});

	it('exposes when an item will be purged', () => {
		const { planner } = createTestPlanner({ now: '2026-01-05T09:00:00.000Z' });
		const task = planner.createTask('owner', { title: 'x' });
		planner.deleteItem('owner', 'task', task.id);
		expect(planner.listTrash()[0].purgeAt).toBe('2026-02-04T09:00:00.000Z');
	});

	it('retention is a construction-time setting', () => {
		const { planner, clock } = createTestPlanner({ trashRetentionDays: 1 });
		const task = planner.createTask('owner', { title: 'x' });
		planner.deleteItem('owner', 'task', task.id);
		clock.advance(DAY);
		expect(planner.purgeTrash()).toBe(1);
	});
});
