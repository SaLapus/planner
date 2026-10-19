import { describe, expect, it } from 'vitest';
import { createTestPlanner } from './testing/harness.js';

describe('scheduling combined with organising', () => {
	it('a Task with due date, priority, project and tags shows in a smart list and a tag filter', () => {
		const { planner } = createTestPlanner({ now: '2026-03-10T09:00:00.000Z' });
		const home = planner.createProject('owner', { name: 'Дом' });
		const t = planner.createTask('claude', {
			title: 'buy milk',
			due: '2026-03-10T18:00',
			priority: 'high',
			projectId: home.id,
			tags: ['магазин']
		});
		planner.addSubtask('owner', t.id, 'check fridge');
		planner.createTask('owner', { title: 'other', due: '2026-03-10', tags: ['работа'] });

		expect(t).toMatchObject({
			dueDate: '2026-03-10',
			dueTime: '18:00',
			priority: 'high',
			projectId: home.id,
			tags: ['магазин']
		});

		const today = planner.tasksIn('today').find((x) => x.id === t.id);
		expect(today).toMatchObject({ projectId: home.id, tags: ['магазин'] });
		expect(today?.subtasks.map((s) => s.title)).toEqual(['check fridge']);

		const byTag = planner.listTasks({ tag: 'магазин' });
		expect(byTag.map((x) => x.title)).toEqual(['buy milk']);
		expect(byTag[0]).toMatchObject({ dueDate: '2026-03-10', priority: 'high' });
		expect(planner.listTasks({ projectId: home.id }).map((x) => x.title)).toEqual(['buy milk']);

		// editing the schedule keeps the organising fields
		const edited = planner.updateTask('owner', t.id, { due: '2026-03-12' });
		expect(edited).toMatchObject({ projectId: home.id, tags: ['магазин'] });
		expect(planner.tasksIn('upcoming').map((x) => x.title)).toEqual(['buy milk']);
	});
});
