import { describe, expect, it } from 'vitest';
import { createTestPlanner } from '#lib/core/testing/harness.js';
import { addDays, mondayOf, toRow, weekDays } from './format.js';

describe('event display', () => {
	it('shows a non-home-zone Event at its own local time, with the home time as a note', () => {
		const { planner } = createTestPlanner();
		planner.createEvent('owner', {
			title: 'Call',
			timeZone: 'Europe/Kyiv',
			start: '2026-01-12T09:30',
			end: '2026-01-12T10:00'
		});
		const [row] = planner.agenda('2026-01-12', '2026-01-12').map(toRow);
		expect(row.when).toBe('09:30–10:00');
		expect(row.zone).toBe('Europe/Kyiv, у вас 10:30');
	});

	it('home-zone and all-day Events have no zone note', () => {
		const { planner } = createTestPlanner();
		planner.createEvent('owner', { title: 'a', start: '2026-01-12T09:30' });
		planner.createEvent('owner', { title: 'b', allDay: true, start: '2026-01-12' });
		const rows = planner.agenda('2026-01-12', '2026-01-12').map(toRow);
		expect(rows.map((r) => [r.when, r.zone])).toEqual([
			['Весь день', ''],
			['09:30–10:30', '']
		]);
	});

	it('adds days across month ends', () => {
		expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
		expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
	});

	it('shows Tasks as their own kind of row, apart from Events', () => {
		const { planner } = createTestPlanner();
		planner.createTask('owner', {
			title: 'Отчёт',
			due: '2026-01-12',
			timeBlock: { start: '2026-01-12T09:00', minutes: 90 }
		});
		planner.createTask('owner', { title: 'Позвонить', due: '2026-01-12T17:30' });
		planner.createTask('owner', { title: 'Хлеб', due: '2026-01-12' });
		planner.createEvent('owner', { title: 'Встреча', start: '2026-01-12T12:00' });
		const rows = planner.agenda('2026-01-12', '2026-01-12').map(toRow);
		expect(rows.map((r) => [r.kind, r.title, r.when])).toEqual([
			['task', 'Хлеб', 'Срок: весь день'],
			['task', 'Отчёт', '09:00–10:30'],
			['event', 'Встреча', '12:00–13:00'],
			['task', 'Позвонить', 'Срок: 17:30']
		]);
		// kind + id is unique even when an Event and a Task share an id
		expect(new Set(rows.map((r) => r.key)).size).toBe(rows.length);
	});
});

describe('week', () => {
	it('starts on Monday', () => {
		expect(mondayOf('2026-01-12')).toBe('2026-01-12'); // Monday
		expect(mondayOf('2026-01-14')).toBe('2026-01-12'); // Wednesday
		expect(mondayOf('2026-01-18')).toBe('2026-01-12'); // Sunday
		expect(mondayOf('2026-01-19')).toBe('2026-01-19');
	});

	it('has seven days, Monday to Sunday', () => {
		const days = weekDays('2026-01-14');
		expect(days).toHaveLength(7);
		expect(days[0]).toBe('2026-01-12');
		expect(days[6]).toBe('2026-01-18');
	});
});
