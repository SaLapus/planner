import { describe, expect, it } from 'vitest';
import { createTestPlanner } from '#lib/core/testing/harness.js';
import { addDays, toRow } from './format.js';

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
});
