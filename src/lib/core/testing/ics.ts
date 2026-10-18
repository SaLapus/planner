/** Test helper: read an iCalendar text back with an independent parser (ical.js). */
import ICAL from 'ical.js';

export function parseFeed(text: string) {
	const root = new ICAL.Component(ICAL.parse(text));
	return {
		root,
		timeZones: root.getAllSubcomponents('vtimezone').map((v) => v.getFirstPropertyValue('tzid') as string),
		events: root.getAllSubcomponents('vevent').map((v) => ({
			uid: v.getFirstPropertyValue('uid') as string,
			summary: v.getFirstPropertyValue('summary') as string,
			dtstart: v.getFirstProperty('dtstart')?.toICALString(),
			dtend: v.getFirstProperty('dtend')?.toICALString(),
			rrule: v.getFirstProperty('rrule')?.toICALString(),
			exdate: v.getAllProperties('exdate').map((p) => p.toICALString()),
			recurrenceId: v.getFirstProperty('recurrence-id')?.toICALString(),
			component: v
		}))
	};
}

export { ICAL };
