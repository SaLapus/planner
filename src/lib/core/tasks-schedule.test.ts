import { describe, expect, it } from 'vitest';
import { createTestPlanner } from './testing/harness.js';

// Home zone Europe/Istanbul = UTC+3.
const titles = (ts: { title: string }[]) => ts.map((t) => t.title);

describe('due date, due time and priority', () => {
	it('defaults to no due date and no priority', () => {
		const { planner } = createTestPlanner();
		const t = planner.createTask('owner', { title: 'x' });
		expect(t).toMatchObject({ dueDate: null, dueTime: null, priority: 'none' });
	});

	it('date-only due means a local Home date', () => {
		const { planner } = createTestPlanner();
		const t = planner.createTask('owner', { title: 'x', due: '2026-03-30', priority: 'high' });
		expect(t).toMatchObject({ dueDate: '2026-03-30', dueTime: null, priority: 'high' });
	});

	it('datetime without offset is Home wall-clock time', () => {
		const { planner } = createTestPlanner();
		const t = planner.createTask('owner', { title: 'x', due: '2026-03-30T10:15' });
		expect(t).toMatchObject({ dueDate: '2026-03-30', dueTime: '10:15' });
	});

	it('datetime with Z or offset is converted to the Home zone', () => {
		const { planner } = createTestPlanner();
		const a = planner.createTask('owner', { title: 'a', due: '2026-03-30T22:00:00Z' });
		expect(a).toMatchObject({ dueDate: '2026-03-31', dueTime: '01:00' });
		const b = planner.createTask('owner', { title: 'b', due: '2026-03-30T10:00:00+05:00' });
		expect(b).toMatchObject({ dueDate: '2026-03-30', dueTime: '08:00' });
	});

	it('rejects garbage dates and priorities', () => {
		const { planner } = createTestPlanner();
		expect(() => planner.createTask('owner', { title: 'x', due: 'tomorrow' })).toThrow(/due/i);
		expect(() => planner.createTask('owner', { title: 'x', due: '2026-02-30' })).toThrow(/due/i);
		expect(() =>
			// @ts-expect-error invalid priority
			planner.createTask('owner', { title: 'x', priority: 'urgent' })
		).toThrow(/priority/i);
		expect(planner.changeLog()).toEqual([]);
	});

	it('updates and clears fields, logging one entry with snapshots', () => {
		const { planner } = createTestPlanner();
		const t = planner.createTask('owner', { title: 'x', due: '2026-03-30T10:00' });
		const u = planner.updateTask('claude', t.id, { due: '2026-04-01', priority: 'low' });
		expect(u).toMatchObject({ dueDate: '2026-04-01', dueTime: null, priority: 'low', title: 'x' });
		const c = planner.updateTask('owner', t.id, { due: null, priority: 'none' });
		expect(c).toMatchObject({ dueDate: null, dueTime: null, priority: 'none' });
		const log = planner.changeLog();
		expect(log).toHaveLength(3);
		expect(log[1]).toMatchObject({ action: 'task.update', actor: 'claude', before: t, after: u });
	});

	it('update can rename and refuses unknown ids', () => {
		const { planner } = createTestPlanner();
		const t = planner.createTask('owner', { title: 'x' });
		expect(planner.updateTask('owner', t.id, { title: ' y ' }).title).toBe('y');
		expect(() => planner.updateTask('owner', t.id, { title: ' ' })).toThrow(/title/i);
		expect(() => planner.updateTask('owner', 99, { title: 'z' })).toThrow(/not found/i);
	});
});

describe('smart lists', () => {
	it('today / upcoming / overdue / inbox around local midnight', () => {
		// 2026-03-10 20:59Z = 23:59 at home on the 10th
		const { planner, clock } = createTestPlanner({ now: '2026-03-10T20:59:00.000Z' });
		planner.createTask('owner', { title: 'yesterday', due: '2026-03-09' });
		planner.createTask('owner', { title: 'tenth', due: '2026-03-10' });
		planner.createTask('owner', { title: 'eleventh', due: '2026-03-11' });
		planner.createTask('owner', { title: 'nodate' });

		expect(titles(planner.tasksIn('overdue'))).toEqual(['yesterday']);
		expect(titles(planner.tasksIn('today'))).toEqual(['tenth']);
		expect(titles(planner.tasksIn('upcoming'))).toEqual(['eleventh']);
		expect(titles(planner.tasksIn('inbox'))).toEqual(['nodate']);

		clock.set('2026-03-10T21:00:00.000Z'); // 00:00 on the 11th at home
		expect(titles(planner.tasksIn('overdue'))).toEqual(['yesterday', 'tenth']);
		expect(titles(planner.tasksIn('today'))).toEqual(['eleventh']);
		expect(planner.tasksIn('upcoming')).toEqual([]);
	});

	it('a timed task becomes overdue once its time passes, a date-only one at day end', () => {
		const { planner, clock } = createTestPlanner({ now: '2026-03-10T06:00:00.000Z' }); // 09:00 home
		planner.createTask('owner', { title: 'timed', due: '2026-03-10T10:00' });
		planner.createTask('owner', { title: 'dateonly', due: '2026-03-10' });
		expect(titles(planner.tasksIn('today'))).toEqual(['timed', 'dateonly']);
		expect(planner.tasksIn('overdue')).toEqual([]);

		clock.set('2026-03-10T07:00:00.000Z'); // 10:00 home: exactly due, not yet late
		expect(planner.tasksIn('overdue')).toEqual([]);
		clock.set('2026-03-10T07:01:00.000Z'); // 10:01 home
		expect(titles(planner.tasksIn('overdue'))).toEqual(['timed']);
		expect(titles(planner.tasksIn('today'))).toEqual(['dateonly']);
	});

	it('uses the configured Home zone, not UTC', () => {
		const { planner } = createTestPlanner({
			homeTimeZone: 'America/Los_Angeles',
			now: '2026-03-10T05:00:00.000Z' // 22:00 on the 9th in LA
		});
		planner.createTask('owner', { title: 'x', due: '2026-03-09' });
		expect(titles(planner.tasksIn('today'))).toEqual(['x']);
	});

	it('completed tasks are in no list', () => {
		const { planner } = createTestPlanner();
		const t = planner.createTask('owner', { title: 'x', due: '2026-01-05' });
		planner.createTask('owner', { title: 'y' });
		planner.completeTask('owner', t.id);
		expect(planner.tasksIn('today')).toEqual([]);
		expect(titles(planner.tasksIn('inbox'))).toEqual(['y']);
	});

	it('orders by due date, then due time (date-only last), then priority high first', () => {
		const { planner } = createTestPlanner({ now: '2026-01-01T00:00:00.000Z' });
		planner.createTask('owner', { title: 'late-low', due: '2026-02-02', priority: 'low' });
		planner.createTask('owner', { title: 'early-none', due: '2026-02-01' });
		planner.createTask('owner', { title: 'same-high', due: '2026-02-01', priority: 'high' });
		planner.createTask('owner', { title: 'same-med', due: '2026-02-01', priority: 'medium' });
		planner.createTask('owner', { title: 'timed', due: '2026-02-01T08:00' });
		expect(titles(planner.tasksIn('upcoming'))).toEqual([
			'timed',
			'same-high',
			'same-med',
			'early-none',
			'late-low'
		]);
	});

	it('inbox orders by priority then creation', () => {
		const { planner } = createTestPlanner();
		planner.createTask('owner', { title: 'a' });
		planner.createTask('owner', { title: 'b', priority: 'high' });
		planner.createTask('owner', { title: 'c' });
		expect(titles(planner.tasksIn('inbox'))).toEqual(['b', 'a', 'c']);
	});
});

describe('text search', () => {
	it('matches case-insensitively, including Cyrillic, and includes completed tasks', () => {
		const { planner } = createTestPlanner();
		planner.createTask('owner', { title: 'Купить Молоко' });
		const d = planner.createTask('owner', { title: 'Buy milk' });
		planner.createTask('owner', { title: 'Call mom' });
		planner.completeTask('owner', d.id);
		expect(titles(planner.searchTasks('молоко'))).toEqual(['Купить Молоко']);
		expect(titles(planner.searchTasks('MILK'))).toEqual(['Buy milk']);
		expect(planner.searchTasks('   ')).toEqual([]);
	});
});
