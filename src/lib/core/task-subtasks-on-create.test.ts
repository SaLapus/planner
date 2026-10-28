import { describe, expect, it } from 'vitest';
import { createTestPlanner } from './testing/harness.js';

describe('creating a task with subtasks', () => {
	it('creates the subtasks in the given order, unticked', () => {
		const { planner } = createTestPlanner();
		const t = planner.createTask('claude', {
			title: 'Чтение',
			subtasks: [' Глава 1 ', 'Глава 2', 'Глава 3']
		});
		expect(t.subtasks.map((s) => [s.title, s.done])).toEqual([
			['Глава 1', false],
			['Глава 2', false],
			['Глава 3', false]
		]);
		expect(planner.getTask(t.id).subtasks.map((s) => s.title)).toEqual([
			'Глава 1',
			'Глава 2',
			'Глава 3'
		]);
		expect(planner.addSubtask('claude', t.id, 'Глава 4').subtasks.at(-1)!.title).toBe('Глава 4');
	});

	it('rejects a blank title and creates nothing', () => {
		const { planner } = createTestPlanner();
		expect(() => planner.createTask('claude', { title: 'T', subtasks: ['ok', '  '] })).toThrow(
			/empty/i
		);
		expect(planner.listTasks()).toEqual([]);
		expect(planner.changeLog()).toEqual([]);
	});

	it('is one task.create entry; undo removes the task with its subtasks', () => {
		const { planner } = createTestPlanner();
		const t = planner.createTask('claude', { title: 'T', subtasks: ['a', 'b'] });
		const log = planner.changeLog();
		expect(log.map((e) => e.action)).toEqual(['task.create']);
		expect(log[0].after).toMatchObject({ subtasks: [{ title: 'a' }, { title: 'b' }] });

		planner.undoChange('owner', log[0].id);
		expect(planner.listTasks()).toEqual([]);
		expect(planner.listTrash().map((x) => x.entityId)).toEqual([t.id]);
		planner.restoreItem('owner', 'task', t.id);
		expect(planner.getTask(t.id).subtasks.map((s) => s.title)).toEqual(['a', 'b']);
	});
});
