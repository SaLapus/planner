import { describe, expect, it } from 'vitest';
import { createTestPlanner } from './testing/harness.js';

// Home zone Europe/Istanbul = UTC+3. 2026-03-30 is a Monday.
const open = (planner: ReturnType<typeof createTestPlanner>['planner']) =>
	planner.listTasks().filter((t) => t.completedAt === null);

describe('fixed repetition', () => {
	it('completing a weekly task keeps it in history and creates next Monday', () => {
		const { planner, clock } = createTestPlanner({ now: '2026-03-30T08:00:00Z' });
		const t = planner.createTask('owner', {
			title: 'Полить цветы',
			due: '2026-03-30T10:00',
			repeat: { type: 'fixed', rrule: 'FREQ=WEEKLY;BYDAY=MO' }
		});
		clock.set('2026-03-30T09:00:00Z');
		const done = planner.completeTask('owner', t.id);
		expect(done.completedAt).not.toBeNull();
		expect(done.nextId).not.toBeNull();

		const next = planner.getTask(done.nextId!);
		expect(next).toMatchObject({
			title: 'Полить цветы',
			completedAt: null,
			dueDate: '2026-04-06',
			dueTime: '10:00'
		});
		// history retained: the completed instance is still there
		expect(planner.getTask(t.id).completedAt).not.toBeNull();
		expect(planner.listTasks()).toHaveLength(2);
	});

	it('completing early still moves to the next occurrence after the due date', () => {
		const { planner } = createTestPlanner({ now: '2026-03-27T08:00:00Z' }); // Friday
		const t = planner.createTask('owner', {
			title: 'x',
			due: '2026-03-30',
			repeat: { type: 'fixed', rrule: 'FREQ=WEEKLY;BYDAY=MO' }
		});
		const next = planner.getTask(planner.completeTask('owner', t.id).nextId!);
		expect(next.dueDate).toBe('2026-04-06');
	});

	it('completing late skips occurrences that are already in the past', () => {
		const { planner } = createTestPlanner({ now: '2026-04-08T08:00:00Z' }); // Wednesday, 9 days late
		const t = planner.createTask('owner', {
			title: 'x',
			due: '2026-03-30',
			repeat: { type: 'fixed', rrule: 'FREQ=WEEKLY;BYDAY=MO' }
		});
		const next = planner.getTask(planner.completeTask('owner', t.id).nextId!);
		expect(next.dueDate).toBe('2026-04-13');
	});

	it('the next instance copies project, tags, priority, milestone and resets subtasks; shifts the time block', () => {
		const { planner } = createTestPlanner({ now: '2026-03-30T08:00:00Z' });
		const project = planner.createProject('owner', { name: 'Дом' });
		const goal = planner.createGoal('owner', { title: 'G' });
		const ms = planner.addMilestone('owner', goal.id, { title: 'M' });
		const t = planner.createTask('owner', {
			title: 'Уборка',
			due: '2026-03-30',
			priority: 'high',
			projectId: project.id,
			tags: ['быт'],
			timeBlock: { start: '2026-03-30T18:00', minutes: 60 },
			repeat: { type: 'fixed', rrule: 'FREQ=WEEKLY' }
		});
		planner.addSubtask('owner', t.id, 'Пылесос');
		planner.setSubtaskDone('owner', t.id, planner.getTask(t.id).subtasks[0].id, true);
		planner.setTaskMilestone('owner', t.id, ms.id);

		const next = planner.getTask(planner.completeTask('owner', t.id).nextId!);
		expect(next).toMatchObject({
			priority: 'high',
			projectId: project.id,
			tags: ['быт'],
			milestoneId: ms.id,
			dueDate: '2026-04-06',
			timeBlock: { start: '2026-04-06T15:00:00Z', minutes: 60 }
		});
		expect(next.subtasks.map((s) => [s.title, s.done])).toEqual([['Пылесос', false]]);
		expect(next.repeat).toEqual({ type: 'fixed', rrule: 'FREQ=WEEKLY' });
	});

	it('a finished rule (COUNT/UNTIL) produces no next instance', () => {
		const { planner } = createTestPlanner({ now: '2026-03-30T08:00:00Z' });
		const t = planner.createTask('owner', {
			title: 'x',
			due: '2026-03-30',
			repeat: { type: 'fixed', rrule: 'FREQ=DAILY;COUNT=2' }
		});
		const second = planner.getTask(planner.completeTask('owner', t.id).nextId!);
		expect(second.dueDate).toBe('2026-03-31');
		expect(planner.completeTask('owner', second.id).nextId).toBeNull();
	});

	it('requires a due date and a valid rule', () => {
		const { planner } = createTestPlanner();
		expect(() =>
			planner.createTask('owner', { title: 'x', repeat: { type: 'fixed', rrule: 'FREQ=DAILY' } })
		).toThrow(/due date/i);
		expect(() =>
			planner.createTask('owner', {
				title: 'x',
				due: '2026-03-30',
				repeat: { type: 'fixed', rrule: 'nonsense' }
			})
		).toThrow();
		const t = planner.createTask('owner', {
			title: 'x',
			due: '2026-03-30',
			repeat: { type: 'fixed', rrule: 'FREQ=DAILY' }
		});
		expect(() => planner.updateTask('owner', t.id, { due: null })).toThrow(/due date/i);
		expect(planner.updateTask('owner', t.id, { repeat: null }).repeat).toBeNull();
	});
});

describe('repetition after completion', () => {
	it('next due is the completion date plus the interval, whatever the old due date was', () => {
		const { planner, clock } = createTestPlanner({ now: '2026-03-30T08:00:00Z' });
		const t = planner.createTask('owner', {
			title: 'Фильтр',
			due: '2026-03-20T09:30',
			repeat: { type: 'after', every: 3, unit: 'day' }
		});
		clock.set('2026-03-30T22:30:00Z'); // 01:30 on the 31st in Istanbul
		const next = planner.getTask(planner.completeTask('owner', t.id).nextId!);
		expect(next).toMatchObject({ dueDate: '2026-04-03', dueTime: '09:30' });
	});

	it('works without a due date and with weeks, months, years', () => {
		const { planner } = createTestPlanner({ now: '2026-01-31T08:00:00Z' });
		const mk = (unit: 'week' | 'month' | 'year', every: number) =>
			planner.getTask(
				planner.completeTask(
					'owner',
					planner.createTask('owner', { title: unit, repeat: { type: 'after', every, unit } }).id
				).nextId!
			).dueDate;
		expect(mk('week', 2)).toBe('2026-02-14');
		expect(mk('month', 1)).toBe('2026-02-28');
		expect(mk('year', 1)).toBe('2027-01-31');
	});

	it('rejects a bad interval', () => {
		const { planner } = createTestPlanner();
		expect(() =>
			planner.createTask('owner', { title: 'x', repeat: { type: 'after', every: 0, unit: 'day' } })
		).toThrow(/every/i);
	});
});

describe('un-completing and undo leave no duplicate', () => {
	const setup = () => {
		const ctx = createTestPlanner({ now: '2026-03-30T08:00:00Z' });
		const t = ctx.planner.createTask('owner', {
			title: 'x',
			due: '2026-03-30',
			repeat: { type: 'fixed', rrule: 'FREQ=WEEKLY' }
		});
		const done = ctx.planner.completeTask('owner', t.id);
		return { ...ctx, t, done };
	};

	it('uncompleting removes the untouched next instance', () => {
		const { planner, t } = setup();
		const back = planner.uncompleteTask('owner', t.id);
		expect(back).toMatchObject({ completedAt: null, nextId: null });
		expect(open(planner).map((x) => x.id)).toEqual([t.id]);
		// completing again creates exactly one next instance
		planner.completeTask('owner', t.id);
		expect(planner.listTasks()).toHaveLength(2);
	});

	it('undoing the completion removes the next instance and redo brings it back', () => {
		const { planner, t, done } = setup();
		const completeEntry = planner.changeLog().find((e) => e.action === 'task.complete')!;
		const undo = planner.undoChange('owner', completeEntry.id);
		expect(planner.listTasks()).toHaveLength(1);
		expect(planner.getTask(t.id).completedAt).toBeNull();
		planner.undoChange('owner', undo.id); // undo the undo
		expect(planner.getTask(t.id).completedAt).not.toBeNull();
		const tasks = planner.listTasks();
		expect(tasks).toHaveLength(2);
		expect(tasks[1].id).toBe(done.nextId);
		expect(tasks[1].dueDate).toBe('2026-04-06');
	});

	it('completing writes exactly one Change log entry and one undo reverts everything', () => {
		const { planner, t } = setup();
		const log = planner.changeLog();
		expect(log.map((e) => e.action)).toEqual(['task.create', 'task.complete']);
		planner.undoChange('owner', log[1].id);
		expect(planner.listTasks().map((x) => x.id)).toEqual([t.id]);
		expect(planner.getTask(t.id).nextId).toBeNull();
	});

	it('refuses to uncomplete or undo once the next instance was edited', () => {
		const { planner, t, done } = setup();
		const completeEntry = planner.changeLog().find((e) => e.action === 'task.complete')!;
		planner.updateTask('owner', done.nextId!, { title: 'edited' });
		expect(() => planner.uncompleteTask('owner', t.id)).toThrow(/next instance/i);
		expect(() => planner.undoChange('owner', completeEntry.id)).toThrow(/next instance/i);
		expect(planner.getTask(t.id).completedAt).not.toBeNull();
		expect(planner.listTasks()).toHaveLength(2);
	});

	it('refuses once the next instance was completed', () => {
		const { planner, t, done } = setup();
		planner.completeTask('owner', done.nextId!);
		expect(() => planner.uncompleteTask('owner', t.id)).toThrow(/next instance/i);
	});

	it('uncompleting when the next instance is in Trash does not let it come back', () => {
		const { planner, t, done } = setup();
		planner.deleteItem('owner', 'task', done.nextId!);
		planner.uncompleteTask('owner', t.id);
		expect(planner.listTrash().filter((i) => i.entityType === 'task')).toHaveLength(0);
	});
});
