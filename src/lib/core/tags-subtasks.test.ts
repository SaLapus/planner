import { describe, expect, it } from 'vitest';
import { createTestPlanner } from './testing/harness.js';

describe('tags', () => {
	it('adds and removes tags on a task; tags are trimmed, unique and sorted', () => {
		const { planner } = createTestPlanner();
		const t = planner.createTask('owner', { title: 'a' });
		planner.addTag('owner', t.id, ' срочно ');
		planner.addTag('owner', t.id, 'дом');
		expect(planner.getTask(t.id).tags).toEqual(['дом', 'срочно']);

		expect(() => planner.addTag('owner', t.id, 'дом')).toThrow(/already/i);
		expect(() => planner.addTag('owner', t.id, '  ')).toThrow(/empty/i);

		expect(planner.removeTag('owner', t.id, 'дом').tags).toEqual(['срочно']);
		expect(() => planner.removeTag('owner', t.id, 'дом')).toThrow(/no tag/i);
	});

	it('creating a task with tags and filtering by tag', () => {
		const { planner } = createTestPlanner();
		planner.createTask('claude', { title: 'a', tags: ['x', 'y'] });
		planner.createTask('owner', { title: 'b', tags: ['y'] });
		planner.createTask('owner', { title: 'c' });

		expect(planner.listTasks({ tag: 'y' }).map((t) => t.title)).toEqual(['a', 'b']);
		expect(planner.listTasks({ tag: 'x' }).map((t) => t.title)).toEqual(['a']);
		expect(planner.listTasks({ tag: 'nope' })).toEqual([]);
		expect(planner.listTags()).toEqual([
			{ tag: 'x', count: 1 },
			{ tag: 'y', count: 2 }
		]);
	});

	it('combines project and tag filters', () => {
		const { planner } = createTestPlanner();
		const p = planner.createProject('owner', { name: 'P' });
		planner.createTask('owner', { title: 'a', projectId: p.id, tags: ['t'] });
		planner.createTask('owner', { title: 'b', tags: ['t'] });
		expect(planner.listTasks({ projectId: p.id, tag: 't' }).map((t) => t.title)).toEqual(['a']);
	});

	it('writes one log entry per tag change with full task snapshots', () => {
		const { planner } = createTestPlanner();
		const t = planner.createTask('owner', { title: 'a', tags: ['x'] });
		expect(planner.changeLog()).toHaveLength(1);
		planner.addTag('claude', t.id, 'y');
		const e = planner.changeLog().at(-1)!;
		expect(e).toMatchObject({ actor: 'claude', action: 'task.add_tag', entityType: 'task' });
		expect(e.before).toMatchObject({ tags: ['x'] });
		expect(e.after).toMatchObject({ tags: ['x', 'y'] });
	});
});

describe('subtasks', () => {
	it('adds, checks, unchecks and removes subtasks in order', () => {
		const { planner } = createTestPlanner();
		const t = planner.createTask('owner', { title: 'trip' });
		planner.addSubtask('owner', t.id, 'билеты');
		const withTwo = planner.addSubtask('owner', t.id, 'паспорт');
		const [a, b] = withTwo.subtasks;
		expect(withTwo.subtasks.map((s) => [s.title, s.done])).toEqual([
			['билеты', false],
			['паспорт', false]
		]);

		const checked = planner.setSubtaskDone('owner', t.id, a.id, true);
		expect(checked.subtasks[0].done).toBe(true);
		expect(planner.setSubtaskDone('owner', t.id, a.id, false).subtasks[0].done).toBe(false);
		expect(() => planner.setSubtaskDone('owner', t.id, a.id, false)).toThrow(/already/i);

		expect(planner.removeSubtask('owner', t.id, a.id).subtasks.map((s) => s.id)).toEqual([b.id]);
		expect(() => planner.removeSubtask('owner', t.id, a.id)).toThrow(/not found/i);
		expect(() => planner.addSubtask('owner', t.id, ' ')).toThrow(/title/i);
	});

	it('reorders subtasks; the order must be a permutation of the existing ones', () => {
		const { planner } = createTestPlanner();
		const t = planner.createTask('owner', { title: 'x' });
		planner.addSubtask('owner', t.id, 'a');
		planner.addSubtask('owner', t.id, 'b');
		const [a, b, c] = planner.addSubtask('owner', t.id, 'c').subtasks;

		const re = planner.reorderSubtasks('claude', t.id, [c.id, a.id, b.id]);
		expect(re.subtasks.map((s) => s.title)).toEqual(['c', 'a', 'b']);
		expect(planner.getTask(t.id).subtasks.map((s) => s.title)).toEqual(['c', 'a', 'b']);
		expect(planner.addSubtask('owner', t.id, 'd').subtasks.map((s) => s.title)).toEqual([
			'c', 'a', 'b', 'd'
		]);

		expect(() => planner.reorderSubtasks('owner', t.id, [a.id, b.id])).toThrow(/every/i);
		expect(() => planner.reorderSubtasks('owner', t.id, [a.id, a.id, b.id, c.id])).toThrow(/every/i);
	});

	it('subtasks do not affect the task completion; one log entry each with snapshots', () => {
		const { planner } = createTestPlanner();
		const t = planner.createTask('owner', { title: 'x' });
		const [s] = planner.addSubtask('claude', t.id, 's').subtasks;
		planner.setSubtaskDone('claude', t.id, s.id, true);
		expect(planner.getTask(t.id).completedAt).toBeNull();

		const log = planner.changeLog();
		expect(log.map((e) => e.action)).toEqual([
			'task.create',
			'task.add_subtask',
			'task.check_subtask'
		]);
		expect(log[2].before).toMatchObject({ subtasks: [{ done: false }] });
		expect(log[2].after).toMatchObject({ subtasks: [{ done: true }] });
	});

	it('a task with subtasks stays listed with them', () => {
		const { planner } = createTestPlanner();
		const t = planner.createTask('owner', { title: 'x' });
		planner.addSubtask('owner', t.id, 's');
		expect(planner.listTasks()[0].subtasks).toHaveLength(1);
	});
});
