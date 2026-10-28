import { describe, expect, it } from 'vitest';
import { createTestPlanner } from './testing/harness.js';

function sourceTask(planner: ReturnType<typeof createTestPlanner>['planner']) {
	const project = planner.createProject('owner', { name: 'Учёба' });
	const goal = planner.createGoal('owner', { title: 'G' });
	const milestone = planner.addMilestone('owner', goal.id, { title: 'M' });
	const t = planner.createTask('owner', {
		title: 'Чтение',
		notes: 'Skiena 3.4',
		priority: 'high',
		projectId: project.id,
		tags: ['book', 'study'],
		subtasks: ['a', 'b'],
		due: '2026-01-09T10:00',
		timeBlock: { start: '2026-01-09T10:00', minutes: 45 },
		repeat: { type: 'after', every: 1, unit: 'week' }
	});
	planner.setTaskMilestone('owner', t.id, milestone.id);
	planner.setSubtaskDone('owner', t.id, planner.getTask(t.id).subtasks[0].id, true);
	return { project, milestone, source: planner.getTask(t.id) };
}

describe('duplicateTask', () => {
	it('copies the listed fields, unticks Subtasks and drops completion, repeat and links', () => {
		const { planner } = createTestPlanner();
		const { project, milestone, source } = sourceTask(planner);
		const d = planner.duplicateTask('claude', source.id);
		expect(d.id).not.toBe(source.id);
		expect(d).toMatchObject({
			title: 'Чтение',
			notes: 'Skiena 3.4',
			priority: 'high',
			projectId: project.id,
			tags: ['book', 'study'],
			milestoneId: milestone.id,
			completedAt: null,
			repeat: null,
			nextId: null
		});
		expect(d.subtasks.map((s) => [s.title, s.done])).toEqual([
			['a', false],
			['b', false]
		]);
		expect(planner.getTask(source.id).nextId).toBeNull();
	});

	it('works from a completed source and gives an open Duplicate', () => {
		const { planner } = createTestPlanner();
		const { source } = sourceTask(planner);
		planner.completeTask('owner', source.id);
		const done = planner.getTask(source.id);
		expect(done.completedAt).not.toBeNull();
		expect(done.nextId).not.toBeNull();
		const d = planner.duplicateTask('claude', source.id);
		expect(d).toMatchObject({ completedAt: null, repeat: null, nextId: null });
	});

	it('keeps due and time block when omitted', () => {
		const { planner } = createTestPlanner();
		const { source } = sourceTask(planner);
		const d = planner.duplicateTask('owner', source.id);
		expect(d).toMatchObject({ dueDate: '2026-01-09', dueTime: '10:00', timeBlock: source.timeBlock });
	});

	it('takes new due and time block, and null clears them', () => {
		const { planner } = createTestPlanner();
		const { source } = sourceTask(planner);
		const moved = planner.duplicateTask('claude', source.id, {
			due: '2026-01-16',
			timeBlock: { start: '2026-01-16T10:00', minutes: 30 }
		});
		expect(moved).toMatchObject({ dueDate: '2026-01-16', dueTime: null });
		expect(moved.timeBlock!.minutes).toBe(30);
		const cleared = planner.duplicateTask('claude', source.id, { due: null, timeBlock: null });
		expect(cleared).toMatchObject({ dueDate: null, dueTime: null, timeBlock: null });
	});

	it('start omitted follows the default rule, not the source start', () => {
		const { planner, clock } = createTestPlanner({ now: '2026-01-05T09:00:00.000Z' });
		const t = planner.createTask('owner', { title: 'x', start: '2026-01-02' });
		clock.set('2026-01-20T09:00:00.000Z');
		expect(planner.duplicateTask('owner', t.id).startDate).toBe('2026-01-20');
		const late = planner.createTask('owner', { title: 'y', due: '2026-01-10' });
		expect(planner.duplicateTask('owner', late.id).startDate).toBe('2026-01-10');
	});

	it('a given start is validated; one after the due date is rejected', () => {
		const { planner } = createTestPlanner();
		const { source } = sourceTask(planner);
		expect(planner.duplicateTask('owner', source.id, { start: '2026-01-08' }).startDate).toBe(
			'2026-01-08'
		);
		expect(() => planner.duplicateTask('owner', source.id, { start: '2026-01-10' })).toThrow(/after/i);
		expect(() => planner.duplicateTask('owner', source.id, { start: 'soon' })).toThrow(/start/i);
		expect(planner.listTasks().filter((t) => t.title === 'Чтение')).toHaveLength(2);
	});

	it('fails readably for a missing, archived-project or trashed source', () => {
		const { planner } = createTestPlanner();
		expect(() => planner.duplicateTask('owner', 999)).toThrow(/999.*not found/i);
		const { project, source } = sourceTask(planner);
		planner.archiveProject('owner', project.id);
		expect(() => planner.duplicateTask('owner', source.id)).toThrow(/archived/i);
		planner.unarchiveProject('owner', project.id);
		planner.deleteItem('owner', 'task', source.id);
		expect(() => planner.duplicateTask('owner', source.id)).toThrow(/trash/i);
		expect(planner.listTasks()).toEqual([]);
	});

	it('is one task.create entry; undo removes the Duplicate', () => {
		const { planner } = createTestPlanner();
		const { source } = sourceTask(planner);
		const d = planner.duplicateTask('claude', source.id);
		const entry = planner.changeLog().find((e) => e.entityId === d.id)!;
		expect([entry.action, entry.actor]).toEqual(['task.create', 'claude']);
		expect(entry.after).toMatchObject({ id: d.id, subtasks: [{ title: 'a' }, { title: 'b' }] });
		expect(planner.changeLog().filter((e) => e.entityId === d.id)).toHaveLength(1);
		planner.undoChange('owner', entry.id);
		expect(() => planner.getTask(d.id)).toThrow();
		expect(planner.getTask(source.id).title).toBe('Чтение');
	});
});
