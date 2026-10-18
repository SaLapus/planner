import { describe, expect, it } from 'vitest';
import { createTestPlanner } from './testing/harness.js';

describe('creating a task', () => {
	it('shows up in the task list, not completed', () => {
		const { planner } = createTestPlanner();

		const task = planner.createTask('owner', { title: 'Купить молоко' });

		expect(task.title).toBe('Купить молоко');
		expect(task.completedAt).toBeNull();
		expect(planner.listTasks()).toEqual([task]);
	});

	it('trims the title and rejects an empty one', () => {
		const { planner } = createTestPlanner();

		expect(planner.createTask('owner', { title: '  hi  ' }).title).toBe('hi');
		expect(() => planner.createTask('owner', { title: '   ' })).toThrow(/title/i);
		expect(planner.listTasks()).toHaveLength(1);
	});

	it('lists tasks in creation order', () => {
		const { planner } = createTestPlanner();
		planner.createTask('owner', { title: 'a' });
		planner.createTask('owner', { title: 'b' });

		expect(planner.listTasks().map((t) => t.title)).toEqual(['a', 'b']);
	});
});

describe('completing and un-completing', () => {
	it('stamps completion with the clock and clears it on uncomplete', () => {
		const { planner, clock } = createTestPlanner({ now: '2026-03-01T10:00:00.000Z' });
		const { id } = planner.createTask('owner', { title: 'x' });

		clock.set('2026-03-02T12:30:00.000Z');
		const done = planner.completeTask('owner', id);
		expect(done.completedAt).toBe('2026-03-02T12:30:00.000Z');
		expect(planner.listTasks()[0].completedAt).toBe('2026-03-02T12:30:00.000Z');

		const undone = planner.uncompleteTask('owner', id);
		expect(undone.completedAt).toBeNull();
		expect(planner.listTasks()[0].completedAt).toBeNull();
	});

	it('refuses unknown ids', () => {
		const { planner } = createTestPlanner();
		expect(() => planner.completeTask('owner', 999)).toThrow(/not found/i);
	});

	it('refuses completing an already completed task (no empty change log entries)', () => {
		const { planner } = createTestPlanner();
		const { id } = planner.createTask('owner', { title: 'x' });
		planner.completeTask('owner', id);

		expect(() => planner.completeTask('owner', id)).toThrow(/already/i);
		expect(planner.changeLog()).toHaveLength(2);
	});
});

describe('change log', () => {
	it('records create with actor, time, and before/after snapshots', () => {
		const { planner } = createTestPlanner({ now: '2026-03-01T10:00:00.000Z' });
		const task = planner.createTask('claude', { title: 'x' });

		expect(planner.changeLog()).toEqual([
			{
				id: expect.any(Number),
				at: '2026-03-01T10:00:00.000Z',
				actor: 'claude',
				action: 'task.create',
				entityType: 'task',
				entityId: task.id,
				before: null,
				after: task
			}
		]);
	});

	it('records exactly one entry per command, with before and after', () => {
		const { planner, clock } = createTestPlanner();
		const created = planner.createTask('owner', { title: 'x' });
		clock.advance(60_000);
		const done = planner.completeTask('claude', created.id);
		clock.advance(60_000);
		const undone = planner.uncompleteTask('owner', created.id);

		const log = planner.changeLog();
		expect(log.map((e) => [e.action, e.actor])).toEqual([
			['task.create', 'owner'],
			['task.complete', 'claude'],
			['task.uncomplete', 'owner']
		]);
		expect(log[1].before).toEqual(created);
		expect(log[1].after).toEqual(done);
		expect(log[2].before).toEqual(done);
		expect(log[2].after).toEqual(undone);
	});

	it('writes nothing when a command fails', () => {
		const { planner } = createTestPlanner();
		expect(() => planner.createTask('owner', { title: '' })).toThrow();
		expect(() => planner.completeTask('owner', 5)).toThrow();
		expect(planner.changeLog()).toEqual([]);
	});
});
