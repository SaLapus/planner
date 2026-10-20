import { describe, expect, it } from 'vitest';
import { createTestPlanner } from './testing/harness.js';

// Home zone Europe/Istanbul = UTC+3. The fake clock starts at 2026-01-05T09:00Z (Home day 2026-01-05).
const titles = (ts: { title: string }[]) => ts.map((t) => t.title);

describe('tasksSplit (the "Все" view)', () => {
	it('splits open Tasks by Start date and puts Completed Tasks apart', () => {
		const { planner } = createTestPlanner();
		planner.createTask('owner', { title: 'now' });
		planner.createTask('owner', { title: 'later', start: '2026-01-06' });
		const done = planner.createTask('owner', { title: 'done' });
		planner.completeTask('owner', done.id);
		const s = planner.tasksSplit();
		expect(titles(s.active)).toEqual(['now']);
		expect(titles(s.notStarted)).toEqual(['later']);
		expect(titles(s.completed)).toEqual(['done']);
	});

	it('turns a Task for tomorrow Active at local midnight Home time', () => {
		const { planner, clock } = createTestPlanner({ now: '2026-01-05T20:59:00Z' }); // 23:59 Home
		planner.createTask('owner', { title: 'tomorrow', start: '2026-01-06' });
		expect(titles(planner.tasksSplit().notStarted)).toEqual(['tomorrow']);
		clock.set('2026-01-05T21:00:00Z'); // 00:00 Home
		const s = planner.tasksSplit();
		expect(titles(s.active)).toEqual(['tomorrow']);
		expect(s.notStarted).toEqual([]);
	});

	it('orders open groups by due date, due time, priority, creation; no due date last', () => {
		const { planner } = createTestPlanner();
		const mk = (title: string, extra = {}) => planner.createTask('owner', { title, ...extra });
		mk('none-low', { priority: 'low' });
		mk('none-high', { priority: 'high' });
		mk('day2', { due: '2026-01-20' });
		mk('day1-date-only-high', { due: '2026-01-10', priority: 'high' });
		mk('day1-1100', { due: '2026-01-10T11:00' });
		mk('day1-0900', { due: '2026-01-10T09:00' });
		mk('day1-date-only-later', { due: '2026-01-10', priority: 'high' });
		expect(titles(planner.tasksSplit().active)).toEqual([
			'day1-0900',
			'day1-1100',
			'day1-date-only-high',
			'day1-date-only-later',
			'day2',
			'none-high',
			'none-low'
		]);
	});

	it('orders not-started Tasks the same way', () => {
		const { planner } = createTestPlanner();
		planner.createTask('owner', { title: 'undated', start: '2026-02-01' });
		planner.createTask('owner', { title: 'dated', start: '2026-02-01', due: '2026-03-01' });
		expect(titles(planner.tasksSplit().notStarted)).toEqual(['dated', 'undated']);
	});

	it('lists Completed Tasks newest completion first', () => {
		const { planner, clock } = createTestPlanner();
		const a = planner.createTask('owner', { title: 'a' });
		const b = planner.createTask('owner', { title: 'b' });
		const c = planner.createTask('owner', { title: 'c' });
		planner.completeTask('owner', b.id);
		clock.advance(60_000);
		planner.completeTask('owner', c.id);
		clock.advance(60_000);
		planner.completeTask('owner', a.id);
		expect(titles(planner.tasksSplit().completed)).toEqual(['a', 'c', 'b']);
	});

	it('applies the project/tag filter to all three groups', () => {
		const { planner } = createTestPlanner();
		const p = planner.createProject('owner', { name: 'Дом' });
		const inP = (title: string, extra = {}) => {
			const t = planner.createTask('owner', { title, ...extra });
			planner.setTaskProject('owner', t.id, p.id);
			return t;
		};
		inP('p-active');
		inP('p-later', { start: '2026-02-01' });
		planner.completeTask('owner', inP('p-done').id);
		const tagged = planner.createTask('owner', { title: 't-active' });
		planner.addTag('owner', tagged.id, 'x');
		planner.createTask('owner', { title: 'other' });

		const byProject = planner.tasksSplit({ projectId: p.id });
		expect(titles(byProject.active)).toEqual(['p-active']);
		expect(titles(byProject.notStarted)).toEqual(['p-later']);
		expect(titles(byProject.completed)).toEqual(['p-done']);
		expect(titles(planner.tasksSplit({ tag: 'x' }).active)).toEqual(['t-active']);
		expect(titles(planner.tasksSplit({ projectId: null }).active)).toEqual(['t-active', 'other']);
	});
});
