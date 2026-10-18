import { describe, expect, it } from 'vitest';
import { createTestPlanner } from './testing/harness.js';
import type { EventAgendaItem, Planner } from './index.js';

/** The Event items of the (merged) agenda. */
const evs = (p: Planner, from: string, to: string) =>
	p.agenda(from, to).filter((i): i is EventAgendaItem => i.kind === 'event');

/** Daily-ish routine in Kyiv, 09:00-10:00 local; 2026-03-25 is a Wednesday. */
function setup(recurrence: string, extra: { start?: string; timeZone?: string; allDay?: boolean; end?: string } = {}) {
	const t = createTestPlanner(); // Home: Europe/Istanbul
	const series = t.planner.createEvent('owner', {
		title: 'Зарядка',
		timeZone: extra.timeZone ?? 'Europe/Kyiv',
		start: extra.start ?? '2026-03-25T09:00',
		end: extra.end,
		allDay: extra.allDay,
		recurrence
	});
	return { ...t, series };
}
const starts = (items: { startLocal: string }[]) => items.map((i) => i.startLocal);

describe('recurring Events: expansion in the agenda', () => {
	it('expands only the occurrences inside the requested range', () => {
		const { planner, series } = setup('FREQ=DAILY');
		const items = evs(planner, '2026-03-26', '2026-03-28');
		expect(starts(items)).toEqual(['2026-03-26T09:00', '2026-03-27T09:00', '2026-03-28T09:00']);
		expect(items[0]).toMatchObject({
			kind: 'event',
			id: series.id,
			title: 'Зарядка',
			recurrenceId: '2026-03-26T09:00',
			recurrence: 'FREQ=DAILY',
			end: '2026-03-26T08:00:00Z'
		});
	});

	it('a one-off Event has no recurrenceId', () => {
		const { planner } = createTestPlanner();
		planner.createEvent('owner', { title: 'x', start: '2026-03-26T09:00' });
		expect(evs(planner, '2026-03-26', '2026-03-26')[0].recurrenceId).toBeNull();
	});

	it('weekly on chosen weekdays with COUNT', () => {
		const { planner } = setup('FREQ=WEEKLY;BYDAY=MO,WE;COUNT=3');
		expect(starts(evs(planner, '2026-01-01', '2026-12-31'))).toEqual([
			'2026-03-25T09:00',
			'2026-03-30T09:00',
			'2026-04-01T09:00'
		]);
	});

	it('every 2 weeks until a date, monthly, yearly', () => {
		const a = setup('FREQ=WEEKLY;INTERVAL=2;UNTIL=2026-04-30');
		expect(starts(evs(a.planner, '2026-03-01', '2026-06-30'))).toEqual([
			'2026-03-25T09:00',
			'2026-04-08T09:00',
			'2026-04-22T09:00'
		]);
		const m = setup('FREQ=MONTHLY;BYMONTHDAY=31', { start: '2026-01-31T09:00' });
		expect(starts(evs(m.planner, '2026-01-01', '2026-06-30'))).toEqual([
			'2026-01-31T09:00',
			'2026-03-31T09:00',
			'2026-05-31T09:00'
		]);
		const y = setup('FREQ=YEARLY', { start: '2026-02-10T09:00' });
		expect(starts(evs(y.planner, '2028-01-01', '2028-12-31'))).toEqual(['2028-02-10T09:00']);
	});

	it('range edges: month and year boundaries', () => {
		const { planner } = setup('FREQ=DAILY', { start: '2026-12-30T09:00' });
		expect(starts(evs(planner, '2026-12-31', '2027-01-01'))).toEqual([
			'2026-12-31T09:00',
			'2027-01-01T09:00'
		]);
		// midnight-spanning occurrence that began the day before is still seen
		const night = setup('FREQ=DAILY', { start: '2026-12-30T23:00', end: '2026-12-31T01:00' });
		expect(starts(evs(night.planner, '2026-12-31', '2026-12-31'))).toEqual(['2026-12-30T23:00']);
	});

	it('wall-clock time is stable across DST in Kyiv, while Istanbul never shifts', () => {
		const kyiv = setup('FREQ=DAILY');
		const items = evs(kyiv.planner, '2026-03-28', '2026-03-30');
		expect(items.map((i) => i.start)).toEqual([
			'2026-03-28T07:00:00Z', // +02
			'2026-03-29T06:00:00Z', // +03: same 09:00 on the wall
			'2026-03-30T06:00:00Z'
		]);
		expect(items.map((i) => i.startHome)).toEqual(['2026-03-28T10:00', '2026-03-29T09:00', '2026-03-30T09:00']); // Kyiv is +1h from Istanbul until the switch

		const ist = setup('FREQ=DAILY', { timeZone: 'Europe/Istanbul' });
		expect(new Set(evs(ist.planner, '2026-03-28', '2026-03-30').map((i) => i.start.slice(11)))).toEqual(
			new Set(['06:00:00Z'])
		);
	});

	it('all-day recurring Events expand to dates', () => {
		const { planner } = setup('FREQ=WEEKLY;COUNT=2', { allDay: true, start: '2026-03-25', timeZone: 'Europe/Istanbul' });
		const items = evs(planner, '2026-03-01', '2026-04-30');
		expect(items.map((i) => [i.start, i.end, i.recurrenceId])).toEqual([
			['2026-03-25', '2026-03-25', '2026-03-25'],
			['2026-04-01', '2026-04-01', '2026-04-01']
		]);
	});

	it('rejects invalid rules', () => {
		const { planner } = createTestPlanner();
		expect(() => planner.createEvent('owner', { title: 'x', start: '2026-03-25T09:00', recurrence: 'nonsense' })).toThrow(/recurrence/i);
	});
});

describe('recurring Events: single occurrences', () => {
	it('cancel one occurrence', () => {
		const { planner, series } = setup('FREQ=DAILY');
		planner.cancelOccurrence('owner', series.id, '2026-03-27T09:00');
		expect(starts(evs(planner, '2026-03-26', '2026-03-28'))).toEqual(['2026-03-26T09:00', '2026-03-28T09:00']);
	});

	it('edit one occurrence: title, and moving it in time', () => {
		const { planner, series } = setup('FREQ=DAILY');
		planner.updateOccurrence('owner', series.id, '2026-03-26T09:00', { title: 'Разовая', notes: 'n' });
		planner.updateOccurrence('owner', series.id, '2026-03-27T09:00', { start: '2026-03-27T18:00' });
		const items = evs(planner, '2026-03-26', '2026-03-28');
		expect(items.map((i) => [i.title, i.startLocal, i.endLocal, i.recurrenceId])).toEqual([
			['Разовая', '2026-03-26T09:00', '2026-03-26T10:00', '2026-03-26T09:00'],
			['Зарядка', '2026-03-27T18:00', '2026-03-27T19:00', '2026-03-27T09:00'],
			['Зарядка', '2026-03-28T09:00', '2026-03-28T10:00', '2026-03-28T09:00']
		]);
	});

	it('an occurrence moved into the range from outside it is found', () => {
		const { planner, series } = setup('FREQ=DAILY');
		planner.updateOccurrence('owner', series.id, '2026-03-26T09:00', { start: '2026-04-10T09:00' });
		expect(starts(evs(planner, '2026-04-10', '2026-04-10'))).toEqual(['2026-04-10T09:00', '2026-04-10T09:00']);
		expect(evs(planner, '2026-03-26', '2026-03-26')).toHaveLength(0);
	});

	it('refuses an occurrence that the rule does not produce, and editing a cancelled one', () => {
		const { planner, series } = setup('FREQ=DAILY;COUNT=2');
		expect(() => planner.cancelOccurrence('owner', series.id, '2026-04-01T09:00')).toThrow(/not an occurrence/);
		planner.cancelOccurrence('owner', series.id, '2026-03-25T09:00');
		expect(() => planner.updateOccurrence('owner', series.id, '2026-03-25T09:00', { title: 'x' })).toThrow(/cancelled/);
	});

	it('editing the whole series with a new time drops per-occurrence overrides', () => {
		const { planner, series } = setup('FREQ=DAILY');
		planner.cancelOccurrence('owner', series.id, '2026-03-27T09:00');
		planner.updateEvent('owner', series.id, { start: '2026-03-25T10:00' });
		expect(starts(evs(planner, '2026-03-26', '2026-03-28'))).toEqual([
			'2026-03-26T10:00',
			'2026-03-27T10:00',
			'2026-03-28T10:00'
		]);
	});

	it('whole-series title change keeps cancellations', () => {
		const { planner, series } = setup('FREQ=DAILY');
		planner.cancelOccurrence('owner', series.id, '2026-03-27T09:00');
		planner.updateEvent('owner', series.id, { title: 'Новое' });
		const items = evs(planner, '2026-03-26', '2026-03-28');
		expect(items.map((i) => i.title)).toEqual(['Новое', 'Новое']);
	});
});

describe('recurring Events: this and following (series split)', () => {
	it('splits the series: old part ends before, new part carries the change', () => {
		const { planner, series } = setup('FREQ=DAILY');
		const tail = planner.updateFollowing('owner', series.id, '2026-03-28T09:00', {
			title: 'Новая зарядка',
			start: '2026-03-28T07:30'
		});
		expect(tail.id).not.toBe(series.id);
		const items = evs(planner, '2026-03-26', '2026-03-30');
		expect(items.map((i) => [i.title, i.startLocal])).toEqual([
			['Зарядка', '2026-03-26T09:00'],
			['Зарядка', '2026-03-27T09:00'],
			['Новая зарядка', '2026-03-28T07:30'],
			['Новая зарядка', '2026-03-29T07:30'],
			['Новая зарядка', '2026-03-30T07:30']
		]);
	});

	it('COUNT is shared out between the two parts', () => {
		const { planner, series } = setup('FREQ=DAILY;COUNT=5');
		planner.updateFollowing('owner', series.id, '2026-03-27T09:00', { title: 'B' });
		const items = evs(planner, '2026-01-01', '2026-12-31');
		expect(items.map((i) => [i.title, i.startLocal.slice(5, 10)])).toEqual([
			['Зарядка', '03-25'],
			['Зарядка', '03-26'],
			['B', '03-27'],
			['B', '03-28'],
			['B', '03-29']
		]);
	});

	it('overrides and cancellations after the split point move to the new series', () => {
		const { planner, series } = setup('FREQ=DAILY');
		planner.cancelOccurrence('owner', series.id, '2026-03-29T09:00');
		planner.updateOccurrence('owner', series.id, '2026-03-26T09:00', { title: 'old-one' });
		planner.updateFollowing('owner', series.id, '2026-03-28T09:00', { title: 'B' });
		const items = evs(planner, '2026-03-26', '2026-03-30');
		expect(items.map((i) => [i.title, i.startLocal.slice(5, 10)])).toEqual([
			['old-one', '03-26'],
			['Зарядка', '03-27'],
			['B', '03-28'],
			['B', '03-30']
		]);
	});

	it('splitting at the first occurrence just edits the series', () => {
		const { planner, series } = setup('FREQ=DAILY;COUNT=3');
		const same = planner.updateFollowing('owner', series.id, '2026-03-25T09:00', { title: 'Z' });
		expect(same.id).toBe(series.id);
		expect(evs(planner, '2026-01-01', '2026-12-31').map((i) => i.title)).toEqual(['Z', 'Z', 'Z']);
	});

	it('the new part can get a different rule', () => {
		const { planner, series } = setup('FREQ=DAILY');
		planner.updateFollowing('owner', series.id, '2026-03-30T09:00', { recurrence: 'FREQ=WEEKLY;BYDAY=MO;COUNT=2' });
		expect(starts(evs(planner, '2026-03-29', '2026-04-30'))).toEqual(['2026-03-29T09:00', '2026-03-30T09:00', '2026-04-06T09:00']);
	});
});

describe('recurring Events: Trash and undo', () => {
	it('moving a series to Trash and back keeps overrides', () => {
		const { planner, series } = setup('FREQ=DAILY');
		planner.cancelOccurrence('owner', series.id, '2026-03-27T09:00');
		planner.deleteItem('owner', 'event', series.id);
		expect(evs(planner, '2026-03-26', '2026-03-28')).toHaveLength(0);
		planner.restoreItem('owner', 'event', series.id);
		expect(starts(evs(planner, '2026-03-26', '2026-03-28'))).toEqual(['2026-03-26T09:00', '2026-03-28T09:00']);
	});

	it('undo of a cancel and of an occurrence edit', () => {
		const { planner, series } = setup('FREQ=DAILY');
		planner.cancelOccurrence('owner', series.id, '2026-03-27T09:00');
		planner.updateOccurrence('owner', series.id, '2026-03-26T09:00', { title: 'one' });
		planner.undoChange('owner', planner.changeLog().find((c) => c.action === 'event.occurrence.update')!.id);
		expect(evs(planner, '2026-03-26', '2026-03-28').map((i) => i.title)).toEqual(['Зарядка', 'Зарядка']);
		planner.undoChange('owner', planner.changeLog().find((c) => c.action === 'event.occurrence.cancel')!.id);
		expect(evs(planner, '2026-03-26', '2026-03-28')).toHaveLength(3);
	});

	it('a split writes exactly one entry; one undo leaves the original series, redo splits again', () => {
		const { planner, series } = setup('FREQ=DAILY');
		const before = planner.changeLog().length;
		const tail = planner.updateFollowing('owner', series.id, '2026-03-28T09:00', { title: 'B' });
		const log = planner.changeLog();
		expect(log).toHaveLength(before + 1);
		const undo = planner.undoChange('owner', log[log.length - 1].id);
		expect(evs(planner, '2026-03-26', '2026-03-30').map((i) => [i.title, i.id])).toEqual(
			[26, 27, 28, 29, 30].map(() => ['Зарядка', series.id])
		);
		expect(planner.getEvent(series.id).recurrence).toBe('FREQ=DAILY');
		expect(() => planner.getEvent(tail.id)).toThrow();
		planner.undoChange('owner', undo.id);
		expect(planner.getEvent(tail.id).title).toBe('B');
		expect(planner.getEvent(series.id).recurrence).toMatch(/UNTIL/);
		expect(evs(planner, '2026-03-26', '2026-03-30')).toHaveLength(5);
	});

	it('refuses to undo a split once the new series was edited', () => {
		const { planner, series } = setup('FREQ=DAILY');
		const tail = planner.updateFollowing('owner', series.id, '2026-03-28T09:00', { title: 'B' });
		const entry = planner.changeLog().at(-1)!;
		planner.updateEvent('owner', tail.id, { title: 'C' });
		expect(() => planner.undoChange('owner', entry.id)).toThrow(/Cannot undo|already changed/);
		expect(planner.getEvent(tail.id).title).toBe('C');
		expect(planner.getEvent(series.id).recurrence).toMatch(/UNTIL/);
	});
});
