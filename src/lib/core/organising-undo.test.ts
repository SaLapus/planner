import { describe, expect, it } from 'vitest';
import { createTestPlanner } from './testing/harness.js';

const lastId = (p: ReturnType<typeof createTestPlanner>['planner']) => p.changeLog().at(-1)!.id;

describe('undo and Trash for projects, tags and subtasks', () => {
	it('undoes a tag add', () => {
		const { planner } = createTestPlanner();
		const t = planner.createTask('owner', { title: 'T' });
		planner.addTag('claude', t.id, 'home');
		planner.undoChange('owner', lastId(planner));
		expect(planner.getTask(t.id).tags).toEqual([]);
	});

	it('undoes a subtask check', () => {
		const { planner } = createTestPlanner();
		const t = planner.createTask('owner', { title: 'T' });
		const sub = planner.addSubtask('owner', t.id, 'step').subtasks[0];
		planner.setSubtaskDone('claude', t.id, sub.id, true);
		planner.undoChange('owner', lastId(planner));
		expect(planner.getTask(t.id).subtasks).toEqual([{ id: sub.id, title: 'step', done: false }]);
	});

	it('undoes set_project', () => {
		const { planner } = createTestPlanner();
		const p = planner.createProject('owner', { name: 'P' });
		const t = planner.createTask('owner', { title: 'T' });
		planner.setTaskProject('claude', t.id, p.id);
		planner.undoChange('owner', lastId(planner));
		expect(planner.getTask(t.id).projectId).toBeNull();
	});

	it('trashes and restores a Project, and undoes rename and archive', () => {
		const { planner } = createTestPlanner();
		const p = planner.createProject('owner', { name: 'P' });
		planner.renameProject('claude', p.id, 'Q');
		planner.undoChange('owner', lastId(planner));
		expect(planner.listProjects()[0].name).toBe('P');
		planner.archiveProject('claude', p.id);
		planner.undoChange('owner', lastId(planner));
		expect(planner.listProjects()[0].archivedAt).toBeNull();

		planner.deleteItem('owner', 'project', p.id);
		expect(planner.listProjects({ includeArchived: true })).toEqual([]);
		expect(planner.listTrash()[0]).toMatchObject({ entityType: 'project', label: 'P' });
		planner.restoreItem('owner', 'project', p.id);
		expect(planner.listProjects()).toEqual([p]);
	});

	it('refuses to trash a Project that still has tasks', () => {
		const { planner } = createTestPlanner();
		const p = planner.createProject('owner', { name: 'P' });
		const t = planner.createTask('owner', { title: 'T', projectId: p.id });
		expect(() => planner.deleteItem('owner', 'project', p.id)).toThrow(/still has 1 task/);
		expect(planner.listProjects()).toHaveLength(1);
		planner.deleteItem('owner', 'task', t.id);
		planner.deleteItem('owner', 'project', p.id);
		expect(() => planner.restoreItem('owner', 'task', t.id)).toThrow(/restore the project first/);
		planner.restoreItem('owner', 'project', p.id);
		planner.restoreItem('owner', 'task', t.id);
		expect(planner.getTask(t.id).projectId).toBe(p.id);
	});

	it('a Task with project, tags and subtasks survives delete and restore', () => {
		const { planner } = createTestPlanner();
		const p = planner.createProject('owner', { name: 'P' });
		const t = planner.createTask('owner', { title: 'T', projectId: p.id, tags: ['a', 'b'] });
		planner.addSubtask('owner', t.id, 's1');
		planner.addSubtask('owner', t.id, 's2');
		const s1 = planner.getTask(t.id).subtasks[0].id;
		planner.setSubtaskDone('owner', t.id, s1, true);
		const before = planner.getTask(t.id);

		planner.deleteItem('claude', 'task', t.id);
		expect(planner.listTasks()).toEqual([]);
		expect(planner.listTags()).toEqual([]);
		planner.restoreItem('owner', 'task', t.id);

		expect(planner.getTask(t.id)).toEqual(before);
		expect(planner.listTags()).toHaveLength(2);
	});
});
