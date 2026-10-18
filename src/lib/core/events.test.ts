import { describe, expect, it } from 'vitest';
import { createTestPlanner } from './testing/harness.js';

describe('Events: creating', () => {
	it('defaults to the Home time zone and stores the instant in UTC', () => {
		const { planner } = createTestPlanner(); // Europe/Istanbul, UTC+3
		const e = planner.createEvent('owner', {
			title: 'Врач',
			start: '2026-01-10T10:00',
			end: '2026-01-10T11:30',
			notes: 'взять карту',
			location: 'Клиника'
		});
		expect(e).toMatchObject({
			title: 'Врач',
			timeZone: 'Europe/Istanbul',
			allDay: false,
			start: '2026-01-10T07:00:00Z',
			end: '2026-01-10T08:30:00Z',
			startLocal: '2026-01-10T10:00',
			notes: 'взять карту',
			location: 'Клиника'
		});
	});

	it('keeps the Event own zone: 09:30 in Kyiv is 07:30 Istanbul in winter', () => {
		const { planner } = createTestPlanner();
		const e = planner.createEvent('owner', {
			title: 'Call',
			timeZone: 'Europe/Kyiv',
			start: '2026-01-12T09:30'
		});
		expect(e.start).toBe('2026-01-12T07:30:00Z');
		expect(e.startLocal).toBe('2026-01-12T09:30');
		expect(e.startHome).toBe('2026-01-12T10:30'); // Istanbul is +3, Kyiv +2
		expect(e.end).toBe('2026-01-12T08:30:00Z'); // default one hour
	});

	it('wall-clock times in a DST zone stay stable across the switch', () => {
		const { planner } = createTestPlanner();
		const before = planner.createEvent('owner', { title: 'a', timeZone: 'Europe/Kyiv', start: '2026-03-28T09:00' });
		const after = planner.createEvent('owner', { title: 'b', timeZone: 'Europe/Kyiv', start: '2026-03-30T09:00' });
		expect(before.start).toBe('2026-03-28T07:00:00Z'); // +02
		expect(after.start).toBe('2026-03-30T06:00:00Z'); // +03 after DST
	});

	it('accepts an explicit offset and converts to UTC', () => {
		const { planner } = createTestPlanner();
		const e = planner.createEvent('claude', { title: 'x', start: '2026-01-10T10:00:00+05:00' });
		expect(e.start).toBe('2026-01-10T05:00:00Z');
	});

	it('rejects bad input', () => {
		const { planner } = createTestPlanner();
		expect(() => planner.createEvent('owner', { title: ' ', start: '2026-01-10T10:00' })).toThrow(/title/);
		expect(() => planner.createEvent('owner', { title: 'x', start: '2026-01-10' })).toThrow(/no time/);
		expect(() => planner.createEvent('owner', { title: 'x', start: 'soon' })).toThrow();
		expect(() => planner.createEvent('owner', { title: 'x', timeZone: 'Mars/Base', start: '2026-01-10T10:00' })).toThrow(/time zone/);
		expect(() => planner.createEvent('owner', { title: 'x', start: '2026-01-10T10:00', end: '2026-01-10T09:00' })).toThrow(/end/);
		expect(planner.changeLog()).toHaveLength(0);
	});

	it('writes one change-log entry with the actor', () => {
		const { planner } = createTestPlanner();
		const e = planner.createEvent('claude', { title: 'x', start: '2026-01-10T10:00' });
		const log = planner.changeLog();
		expect(log).toHaveLength(1);
		expect(log[0]).toMatchObject({ actor: 'claude', action: 'event.create', entityType: 'event', entityId: e.id, before: null });
	});
});

describe('Events: all-day', () => {
	it('stores local dates, not instants', () => {
		const { planner } = createTestPlanner();
		const e = planner.createEvent('owner', { title: 'ДР', allDay: true, start: '2026-02-03' });
		expect(e).toMatchObject({ allDay: true, start: '2026-02-03', end: '2026-02-03' });
	});

	it('a multi-day all-day Event shows on every day it covers, and not outside', () => {
		const { planner } = createTestPlanner();
		planner.createEvent('owner', { title: 'Поездка', allDay: true, start: '2026-02-03', end: '2026-02-05' });
		const titles = (d: string) => planner.agenda(d, d).map((i) => i.title);
		expect(titles('2026-02-02')).toEqual([]);
		expect(titles('2026-02-03')).toEqual(['Поездка']);
		expect(titles('2026-02-04')).toEqual(['Поездка']);
		expect(titles('2026-02-05')).toEqual(['Поездка']);
		expect(titles('2026-02-06')).toEqual([]);
	});

	it('rejects an end before the start', () => {
		const { planner } = createTestPlanner();
		expect(() => planner.createEvent('owner', { title: 'x', allDay: true, start: '2026-02-05', end: '2026-02-03' })).toThrow();
	});
});

describe('agenda range boundaries', () => {
	const make = () => {
		const t = createTestPlanner();
		// 2026-01-10 in Istanbul: 00:00 = 2026-01-09T21:00Z
		t.planner.createEvent('owner', { title: 'late-night', start: '2026-01-09T23:30', end: '2026-01-10T00:30' });
		t.planner.createEvent('owner', { title: 'ends-at-midnight', start: '2026-01-09T22:00', end: '2026-01-10T00:00' });
		t.planner.createEvent('owner', { title: 'starts-at-midnight', start: '2026-01-10T00:00', end: '2026-01-10T01:00' });
		t.planner.createEvent('owner', { title: 'evening', start: '2026-01-10T20:00', end: '2026-01-10T21:00' });
		t.planner.createEvent('owner', { title: 'next-day', start: '2026-01-11T00:00', end: '2026-01-11T01:00' });
		return t.planner;
	};

	it('a date range is whole local days: end date inclusive, midnight edges respected', () => {
		const planner = make();
		const titles = planner.agenda('2026-01-10', '2026-01-10').map((i) => i.title);
		expect(titles).toEqual(['late-night', 'starts-at-midnight', 'evening']);
	});

	it('an Event ending exactly at the range start is excluded; one starting exactly at the range end is excluded', () => {
		const planner = make();
		const titles = planner.agenda('2026-01-10T00:00', '2026-01-11T00:00').map((i) => i.title);
		expect(titles).not.toContain('ends-at-midnight');
		expect(titles).not.toContain('next-day');
		expect(titles).toContain('starts-at-midnight');
	});

	it('interprets the range in the Home zone, not UTC', () => {
		const { planner } = createTestPlanner({ homeTimeZone: 'Pacific/Auckland' });
		planner.createEvent('owner', { title: 'x', start: '2026-01-10T01:00' }); // Auckland morning = previous day in UTC
		expect(planner.agenda('2026-01-10', '2026-01-10')).toHaveLength(1);
		expect(planner.agenda('2026-01-09', '2026-01-09')).toHaveLength(0);
	});

	it('returns a typed, start-ordered list of items', () => {
		const { planner } = createTestPlanner();
		planner.createEvent('owner', { title: 'second', start: '2026-01-10T15:00' });
		planner.createEvent('owner', { title: 'allday', allDay: true, start: '2026-01-10' });
		planner.createEvent('owner', { title: 'first', start: '2026-01-10T09:00' });
		const items = planner.agenda('2026-01-10', '2026-01-10');
		expect(items.map((i) => [i.kind, i.title])).toEqual([
			['event', 'allday'],
			['event', 'first'],
			['event', 'second']
		]);
	});

	it('a non-home-zone Event is placed by its true instant', () => {
		const { planner } = createTestPlanner();
		// 23:30 in Los Angeles on Jan 9 = Jan 10 10:30 in Istanbul
		planner.createEvent('owner', { title: 'LA', timeZone: 'America/Los_Angeles', start: '2026-01-09T23:30' });
		expect(planner.agenda('2026-01-10', '2026-01-10').map((i) => i.title)).toEqual(['LA']);
		expect(planner.agenda('2026-01-09', '2026-01-09')).toEqual([]);
	});

	it('rejects a reversed range', () => {
		const { planner } = createTestPlanner();
		expect(() => planner.agenda('2026-01-11', '2026-01-10')).toThrow();
	});
});

describe('Events: update, delete, restore', () => {
	it('updates only the given fields and logs before/after', () => {
		const { planner } = createTestPlanner();
		const e = planner.createEvent('owner', { title: 'old', start: '2026-01-10T10:00', end: '2026-01-10T11:00' });
		const u = planner.updateEvent('claude', e.id, { title: 'new', location: 'Дом' });
		expect(u).toMatchObject({ title: 'new', location: 'Дом', start: e.start, end: e.end });
		const entry = planner.changeLog().at(-1)!;
		expect(entry).toMatchObject({ actor: 'claude', action: 'event.update' });
		expect((entry.before as { title: string }).title).toBe('old');
		expect((entry.after as { title: string }).title).toBe('new');
	});

	it('can switch between timed and all-day only with a new start', () => {
		const { planner } = createTestPlanner();
		const e = planner.createEvent('owner', { title: 'x', start: '2026-01-10T10:00' });
		expect(() => planner.updateEvent('owner', e.id, { allDay: true })).toThrow(/start/);
		const u = planner.updateEvent('owner', e.id, { allDay: true, start: '2026-01-10' });
		expect(u).toMatchObject({ allDay: true, start: '2026-01-10', end: '2026-01-10' });
		const back = planner.updateEvent('owner', e.id, { allDay: false, start: '2026-01-11T08:00' });
		expect(back.allDay).toBe(false);
	});

	it('delete is soft: gone from queries, restorable', () => {
		const { planner } = createTestPlanner();
		const e = planner.createEvent('owner', { title: 'x', start: '2026-01-10T10:00' });
		planner.deleteEvent('claude', e.id);
		expect(planner.agenda('2026-01-10', '2026-01-10')).toEqual([]);
		expect(() => planner.getEvent(e.id)).toThrow();
		expect(() => planner.updateEvent('owner', e.id, { title: 'y' })).toThrow();
		expect(() => planner.deleteEvent('owner', e.id)).toThrow();
		planner.restoreEvent('owner', e.id);
		expect(planner.agenda('2026-01-10', '2026-01-10').map((i) => i.title)).toEqual(['x']);
		expect(planner.changeLog().map((l) => l.action)).toEqual(['event.create', 'event.delete', 'event.restore']);
	});

	it('refuses to restore an Event that is not deleted', () => {
		const { planner } = createTestPlanner();
		const e = planner.createEvent('owner', { title: 'x', start: '2026-01-10T10:00' });
		expect(() => planner.restoreEvent('owner', e.id)).toThrow();
	});
});

describe('today', () => {
	it('is the local date in the Home zone, not UTC', () => {
		const { planner } = createTestPlanner({ now: '2026-01-09T22:00:00Z' }); // 01:00 Jan 10 in Istanbul
		expect(planner.today()).toBe('2026-01-10');
	});
});
