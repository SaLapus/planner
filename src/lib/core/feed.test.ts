import { describe, expect, it } from 'vitest';
import { createTestPlanner } from './testing/harness.js';
import { ICAL, parseFeed } from './testing/ics.js';

const parse = (text: string) => parseFeed(text).events;

describe('calendar feed: recurring Events', () => {
	function seriesWithExceptions() {
		const t = createTestPlanner();
		const series = t.planner.createEvent('owner', {
			title: 'Стендап',
			timeZone: 'Europe/Kyiv',
			start: '2026-03-25T09:00',
			end: '2026-03-25T09:30',
			recurrence: 'FREQ=DAILY;COUNT=10'
		});
		t.planner.cancelOccurrence('owner', series.id, '2026-03-27T09:00');
		t.planner.updateOccurrence('owner', series.id, '2026-03-30T09:00', {
			title: 'Стендап (перенесён)',
			start: '2026-03-30T11:00'
		});
		return { ...t, series };
	}

	it('exports the series with RRULE, one EXDATE per cancelled occurrence, and a RECURRENCE-ID override', () => {
		const { planner, series } = seriesWithExceptions();
		const events = parse(planner.calendarFeed());
		const uid = `event-${series.id}@planner`;
		const master = events.find((e) => e.uid === uid && !e.recurrenceId)!;
		expect(master.summary).toBe('Стендап');
		expect(master.dtstart).toBe('DTSTART;TZID=Europe/Kyiv:20260325T090000');
		expect(master.dtend).toBe('DTEND;TZID=Europe/Kyiv:20260325T093000');
		expect(master.rrule).toBe('RRULE:FREQ=DAILY;COUNT=10');
		expect(master.exdate).toEqual(['EXDATE;TZID=Europe/Kyiv:20260327T090000']);

		const moved = events.find((e) => e.uid === uid && e.recurrenceId)!;
		expect(moved.recurrenceId).toBe('RECURRENCE-ID;TZID=Europe/Kyiv:20260330T090000');
		expect(moved.dtstart).toBe('DTSTART;TZID=Europe/Kyiv:20260330T110000');
		expect(moved.dtend).toBe('DTEND;TZID=Europe/Kyiv:20260330T113000');
		expect(moved.summary).toBe('Стендап (перенесён)');
	});

	it('includes a VTIMEZONE for the zone used, so DST is right in the calendar app', () => {
		const { planner } = seriesWithExceptions();
		expect(parseFeed(planner.calendarFeed()).timeZones).toContain('Europe/Kyiv');
	});
});

describe('calendar feed: all-day Events', () => {
	it('exports dates (VALUE=DATE) with an exclusive DTEND, since the core end date is inclusive', () => {
		const { planner } = createTestPlanner();
		const trip = planner.createEvent('owner', {
			title: 'Поездка',
			allDay: true,
			start: '2026-05-01',
			end: '2026-05-03'
		});
		const [e] = parse(planner.calendarFeed());
		expect(e.uid).toBe(`event-${trip.id}@planner`);
		expect(e.dtstart).toBe('DTSTART;VALUE=DATE:20260501');
		expect(e.dtend).toBe('DTEND;VALUE=DATE:20260504');
	});

	it('exports a yearly all-day series with a cancelled year as EXDATE and an edited year as an override', () => {
		const { planner } = createTestPlanner();
		const bday = planner.createEvent('owner', {
			title: 'День рождения',
			allDay: true,
			start: '2026-07-10',
			recurrence: 'FREQ=YEARLY'
		});
		planner.cancelOccurrence('owner', bday.id, '2027-07-10');
		planner.updateOccurrence('owner', bday.id, '2028-07-10', { title: 'Юбилей' });
		const events = parse(planner.calendarFeed());
		const master = events.find((e) => !e.recurrenceId)!;
		expect(master.rrule).toBe('RRULE:FREQ=YEARLY');
		expect(master.exdate).toEqual(['EXDATE;VALUE=DATE:20270710']);
		const edited = events.find((e) => e.recurrenceId)!;
		expect(edited.recurrenceId).toBe('RECURRENCE-ID;VALUE=DATE:20280710');
		expect(edited.dtstart).toBe('DTSTART;VALUE=DATE:20280710');
		expect(edited.summary).toBe('Юбилей');
	});
});

describe('calendar feed: time zones across DST', () => {
	it('lets an independent iCal engine expand the series to the same instants as the core agenda', () => {
		const { planner } = createTestPlanner();
		// Kyiv switches to summer time on 2026-03-29: wall clock stays 09:00, the UTC instant moves.
		planner.createEvent('owner', {
			title: 'Зарядка',
			timeZone: 'Europe/Kyiv',
			start: '2026-03-27T09:00',
			recurrence: 'FREQ=DAILY;COUNT=4'
		});
		const { root } = parseFeed(planner.calendarFeed());
		const event = new ICAL.Event(root.getFirstSubcomponent('vevent')!);
		const fromIcal: string[] = [];
		const iterator = event.iterator();
		for (let next = iterator.next(); next; next = iterator.next()) {
			fromIcal.push(next.toJSDate().toISOString());
		}
		// 09:00 Kyiv is 07:00Z before the switch (UTC+2) and 06:00Z after it (UTC+3)
		expect(fromIcal).toEqual([
			'2026-03-27T07:00:00.000Z',
			'2026-03-28T07:00:00.000Z',
			'2026-03-29T06:00:00.000Z',
			'2026-03-30T06:00:00.000Z'
		]);
	});
});
