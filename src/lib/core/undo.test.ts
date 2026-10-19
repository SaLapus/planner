import { describe, expect, it } from 'vitest';
import { createTestPlanner } from './testing/harness.js';

const lastId = (p: ReturnType<typeof createTestPlanner>['planner']) => p.changeLog().at(-1)!.id;

describe('undoChange', () => {
	it('undoes a create: the task goes to Trash', () => {
		const { planner } = createTestPlanner();
		const task = planner.createTask('claude', { title: 'Oops' });

		const entry = planner.undoChange('owner', lastId(planner));

		expect(planner.listTasks()).toEqual([]);
		expect(planner.listTrash()).toHaveLength(1);
		expect(entry).toMatchObject({ actor: 'owner', entityId: task.id, after: null });
	});

	it('undoes complete and uncomplete', () => {
		const { planner } = createTestPlanner();
		const task = planner.createTask('owner', { title: 'T' });
		planner.completeTask('claude', task.id);
		planner.undoChange('owner', lastId(planner));
		expect(planner.listTasks()[0].completedAt).toBeNull();

		planner.completeTask('owner', task.id);
		planner.uncompleteTask('claude', task.id);
		planner.undoChange('owner', lastId(planner));
		expect(planner.listTasks()[0].completedAt).not.toBeNull();
	});

	it('undoes a delete: the task is back, Trash is empty', () => {
		const { planner } = createTestPlanner();
		const task = planner.createTask('owner', { title: 'T' });
		const before = planner.listTasks();
		planner.deleteItem('claude', 'task', task.id);

		planner.undoChange('owner', lastId(planner));

		expect(planner.listTasks()).toEqual(before);
		expect(planner.listTrash()).toEqual([]);
	});

	it('undoes a restore, and an undo can itself be undone', () => {
		const { planner } = createTestPlanner();
		const task = planner.createTask('owner', { title: 'T' });
		planner.deleteItem('owner', 'task', task.id);
		planner.restoreItem('owner', 'task', task.id);
		planner.undoChange('owner', lastId(planner)); // back in Trash
		expect(planner.listTasks()).toEqual([]);

		planner.undoChange('owner', lastId(planner)); // undo the undo
		expect(planner.listTasks()).toHaveLength(1);
	});

	it('undoes an update and keeps due date and priority through delete + restore', () => {
		const { planner } = createTestPlanner();
		const task = planner.createTask('owner', { title: 'T', due: '2026-03-30T10:00', priority: 'high' });
		const original = planner.listTasks()[0];
		planner.updateTask('claude', task.id, { title: 'T2', due: null, priority: 'low' });
		planner.undoChange('owner', lastId(planner));
		expect(planner.listTasks()).toEqual([original]);

		planner.deleteItem('owner', 'task', task.id);
		planner.restoreItem('owner', 'task', task.id);
		expect(planner.listTasks()).toEqual([original]);
	});

	it('writes its own change-log entry with the undoing actor', () => {
		const { planner } = createTestPlanner();
		const task = planner.createTask('owner', { title: 'T' });
		planner.completeTask('owner', task.id);
		const target = lastId(planner);
		const n = planner.changeLog().length;

		planner.undoChange('claude', target);

		const log = planner.changeLog();
		expect(log).toHaveLength(n + 1);
		expect(log.at(-1)).toMatchObject({ actor: 'claude', entityType: 'task', entityId: task.id });
	});

	it('is refused, with a reason, when the entity changed after that entry', () => {
		const { planner } = createTestPlanner();
		const task = planner.createTask('owner', { title: 'T' });
		const createId = lastId(planner);
		planner.completeTask('owner', task.id);
		const n = planner.changeLog().length;

		expect(planner.undoBlockedReason(createId)).toMatch(/changed after/);
		expect(() => planner.undoChange('owner', createId)).toThrow(/Cannot undo change #\d+: .*changed after/);
		expect(planner.changeLog()).toHaveLength(n);
		expect(planner.listTasks()).toHaveLength(1);
	});

	it('is refused when the entity was deleted after the entry', () => {
		const { planner } = createTestPlanner();
		const task = planner.createTask('owner', { title: 'T' });
		planner.completeTask('owner', task.id);
		const completeId = lastId(planner);
		planner.deleteItem('owner', 'task', task.id);

		expect(() => planner.undoChange('owner', completeId)).toThrow(/changed after/);
	});

	it('refuses to undo a delete that was already restored, or already purged', () => {
		const { planner, clock } = createTestPlanner();
		const task = planner.createTask('owner', { title: 'T' });
		planner.deleteItem('owner', 'task', task.id);
		const deleteId = lastId(planner);
		planner.restoreItem('owner', 'task', task.id);
		expect(() => planner.undoChange('owner', deleteId)).toThrow(/Cannot undo/);

		planner.deleteItem('owner', 'task', task.id);
		const secondDelete = lastId(planner);
		clock.advance(31 * 24 * 60 * 60 * 1000);
		planner.purgeTrash();
		expect(planner.undoBlockedReason(secondDelete)).toMatch(/purged/);
	});

	it('refuses an unknown change id and an undo that is already undone', () => {
		const { planner } = createTestPlanner();
		expect(() => planner.undoChange('owner', 42)).toThrow(/not found/);
		planner.createTask('owner', { title: 'T' });
		const id = lastId(planner);
		planner.undoChange('owner', id);
		expect(() => planner.undoChange('owner', id)).toThrow(/Cannot undo/);
	});
});

describe('changeLog filter', () => {
	it('can be limited to one actor', () => {
		const { planner } = createTestPlanner();
		planner.createTask('owner', { title: 'mine' });
		planner.createTask('claude', { title: 'theirs' });
		expect(planner.changeLog({ actor: 'claude' }).map((e) => e.actor)).toEqual(['claude']);
		expect(planner.changeLog()).toHaveLength(2);
	});
});
