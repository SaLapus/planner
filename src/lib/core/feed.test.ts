import ICAL from 'ical.js';
import { describe, expect, it } from 'vitest';
import { createTestPlanner } from './testing/harness.js';

/** Parse the feed text back with an independent iCal parser. */
function parse(text: string) {
	const root = new ICAL.Component(ICAL.parse(text));
	return root.getAllSubcomponents('vevent').map((v) => ({
		uid: v.getFirstPropertyValue('uid') as string,
		summary: v.getFirstPropertyValue('summary') as string,
		dtstart: v.getFirstProperty('dtstart')?.toICALString(),
		dtend: v.getFirstProperty('dtend')?.toICALString(),
		rrule: v.getFirstProperty('rrule')?.toICALString(),
		exdate: v.getAllProperties('exdate').map((p) => p.toICALString()),
		recurrenceId: v.getFirstProperty('recurrence-id')?.toICALString()
	}));
}

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
		const root = new ICAL.Component(ICAL.parse(planner.calendarFeed()));
		const tz = root.getAllSubcomponents('vtimezone').map((v) => v.getFirstPropertyValue('tzid'));
		expect(tz).toContain('Europe/Kyiv');
	});
});
