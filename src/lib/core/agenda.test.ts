import { describe, expect, it } from 'vitest';
import { createTestPlanner } from './testing/harness.js';

// Home zone Europe/Istanbul = UTC+3.
const brief = (items: { kind: string; title: string; placement?: string }[]) =>
	items.map((i) => (i.kind === 'task' ? `${i.placement}:${i.title}` : `${i.kind}:${i.title}`));

describe('agenda merges Events, time-blocked Tasks and due Tasks', () => {
	it('orders everything by start; each item says what it is', () => {
		const { planner } = createTestPlanner();
		planner.createEvent('owner', { title: 'Встреча', start: '2026-03-30T12:00', end: '2026-03-30T13:00' });
		planner.createTask('owner', {
			title: 'Отчёт',
			timeBlock: { start: '2026-03-30T09:00', minutes: 90 }
		});
		planner.createTask('owner', { title: 'Позвонить', due: '2026-03-30T10:30' });
		planner.createTask('owner', { title: 'Купить хлеб', due: '2026-03-30' });
		planner.createEvent('owner', { title: 'ДР', allDay: true, start: '2026-03-30' });

		const items = planner.agenda('2026-03-30', '2026-03-30');
		expect(brief(items)).toEqual([
			// all-day things first (they start at midnight), then by time
			'event:ДР',
			'due:Купить хлеб',
			'time_block:Отчёт',
			'due:Позвонить',
			'event:Встреча'
		]);
	});

	it('a time-blocked Task shows its block as a UTC span with Home wall clock', () => {
		const { planner } = createTestPlanner();
		const t = planner.createTask('owner', {
			title: 'Отчёт',
			timeBlock: { start: '2026-03-30T09:00', minutes: 90 }
		});
		const [item] = planner.agenda('2026-03-30', '2026-03-30');
		expect(item).toMatchObject({
			kind: 'task',
			placement: 'time_block',
			id: t.id,
			allDay: false,
			start: '2026-03-30T06:00:00Z',
			end: '2026-03-30T07:30:00Z',
			startHome: '2026-03-30T09:00',
			endHome: '2026-03-30T10:30'
		});
	});

	it('a due Task is a point at its due time, or an all-day entry when it has no time', () => {
		const { planner } = createTestPlanner();
		planner.createTask('owner', { title: 'a', due: '2026-03-30T10:30', priority: 'high' });
		planner.createTask('owner', { title: 'b', due: '2026-03-31' });
		const [a, b] = planner.agenda('2026-03-30', '2026-03-31');
		expect(a).toMatchObject({
			kind: 'task',
			placement: 'due',
			allDay: false,
			priority: 'high',
			start: '2026-03-30T07:30:00Z',
			end: '2026-03-30T07:30:00Z',
			startHome: '2026-03-30T10:30'
		});
		expect(b).toMatchObject({ placement: 'due', allDay: true, start: '2026-03-31', end: '2026-03-31' });
	});

	it('a Task both due and time-blocked appears once, as its time block', () => {
		const { planner } = createTestPlanner();
		planner.createTask('owner', {
			title: 'Сдать отчёт',
			due: '2026-03-30',
			timeBlock: { start: '2026-03-30T14:00', minutes: 60 }
		});
		const items = planner.agenda('2026-03-29', '2026-03-31');
		expect(brief(items)).toEqual(['time_block:Сдать отчёт']);
		expect(items[0]).toMatchObject({ dueDate: '2026-03-30' });
	});

	it('a time block planned for another day than the due date shows on the block day only', () => {
		const { planner } = createTestPlanner();
		planner.createTask('owner', {
			title: 'x',
			due: '2026-04-05',
			timeBlock: { start: '2026-03-30T14:00', minutes: 60 }
		});
		expect(brief(planner.agenda('2026-03-30', '2026-03-30'))).toEqual(['time_block:x']);
		expect(planner.agenda('2026-04-05', '2026-04-05')).toEqual([]);
	});

	it('completed Tasks are not scheduled; un-completing brings them back', () => {
		const { planner } = createTestPlanner();
		const t = planner.createTask('owner', { title: 'x', due: '2026-03-30' });
		planner.completeTask('owner', t.id);
		expect(planner.agenda('2026-03-30', '2026-03-30')).toEqual([]);
		planner.uncompleteTask('owner', t.id);
		expect(planner.agenda('2026-03-30', '2026-03-30')).toHaveLength(1);
	});

	it('range edges: a block across midnight is on both days; other days stay clean', () => {
		const { planner } = createTestPlanner();
		planner.createTask('owner', {
			title: 'Ночь',
			timeBlock: { start: '2026-03-30T23:00', minutes: 120 }
		});
		expect(planner.agenda('2026-03-30', '2026-03-30')).toHaveLength(1);
		expect(planner.agenda('2026-03-31', '2026-03-31')).toHaveLength(1);
		expect(planner.agenda('2026-03-29', '2026-03-29')).toEqual([]);
		expect(planner.agenda('2026-04-01', '2026-04-01')).toEqual([]);
		// a block ending exactly at the range start does not overlap it
		expect(planner.agenda('2026-03-30T23:30', '2026-03-30T23:31')).toHaveLength(1);
		expect(planner.agenda('2026-03-31T01:00', '2026-03-31T02:00')).toEqual([]);
	});

	it('Trash removes Tasks from the agenda and restore brings them back', () => {
		const { planner } = createTestPlanner();
		const t = planner.createTask('owner', { title: 'x', due: '2026-03-30' });
		planner.deleteItem('owner', 'task', t.id);
		expect(planner.agenda('2026-03-30', '2026-03-30')).toEqual([]);
		planner.restoreItem('owner', 'task', t.id);
		expect(planner.agenda('2026-03-30', '2026-03-30')).toHaveLength(1);
	});

	it('rejects a range that ends before it starts (as for Events)', () => {
		const { planner } = createTestPlanner();
		expect(() => planner.agenda('2026-03-31', '2026-03-30')).toThrow(/range/i);
	});
});
