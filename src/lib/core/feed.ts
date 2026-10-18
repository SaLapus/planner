/**
 * The Calendar feed: an iCalendar (RFC 5545) text with all Events and time-blocked Tasks, so any
 * calendar app can subscribe to it. Read-only. The secret URL, its regeneration and the HTTP side
 * live elsewhere (`server/feed.ts`, routes); this module only turns Planner data into iCal text.
 *
 * How core data maps to iCal:
 *  - an Event is one VEVENT with `DTSTART;TZID=<its zone>` (all-day: `VALUE=DATE`), so the
 *    calendar app keeps the wall-clock time across DST;
 *  - a recurring Event carries `RRULE` (UNTIL in UTC form, via `toRfcRule`);
 *  - a cancelled occurrence is an `EXDATE` on the series;
 *  - an edited or moved occurrence is a second VEVENT with the same UID and a `RECURRENCE-ID`
 *    (the occurrence's ORIGINAL start);
 *  - an open Task with a Time block is a plain VEVENT.
 */
import ical, { type ICalEventData } from 'ical-generator';
import { tzlib_get_ical_block } from 'timezones-ical-library';
import type { CoreContext } from './context.js';
import type { Event, EventApi } from './events.js';
import { toRfcRule } from './recurrence.js';

export interface FeedApi {
	/** The whole feed as iCalendar text. */
	calendarFeed(): string;
}

/** Zoned time for a stored UTC instant. ical-generator formats ZonedDateTime without touching the process zone. */
const inZone = (instant: string, zone: string) => Temporal.Instant.from(instant).toZonedDateTimeISO(zone);
const localIn = (wall: string, zone: string) => Temporal.PlainDateTime.from(wall).toZonedDateTime(zone);
const compact = (wall: string) =>
	Temporal.PlainDateTime.from(wall).toString({ smallestUnit: 'second' }).replace(/[-:]/g, '');

export function feedModule(
	{ db }: CoreContext,
	{ getEvent }: Pick<EventApi, 'getEvent'>
): FeedApi {
	type Calendar = ReturnType<typeof ical>;

	function addEvent(cal: Calendar, e: Event) {
		const id = `event-${e.id}@planner`;
		const zone = e.timeZone;
		const base: ICalEventData = {
			id,
			summary: e.title,
			description: e.notes || null,
			location: e.location || null,
			timezone: zone,
			start: inZone(e.start, zone),
			end: inZone(e.end, zone)
		};
		if (!e.recurrence) {
			cal.createEvent(base);
			return;
		}
		// ical-generator copies a multi-line string as it is, which is the only way to get a
		// stored RRULE together with one EXDATE line per cancelled occurrence.
		const rule = toRfcRule({ rrule: e.recurrence, startLocal: e.startLocal, timeZone: zone });
		const exdates = Object.entries(e.overrides)
			.filter(([, o]) => o.cancelled)
			.map(([rid]) => `EXDATE;TZID=${zone}:${compact(rid)}`);
		cal.createEvent({ ...base, repeating: [`RRULE:${rule}`, ...exdates].join('\n') });

		const duration = Temporal.Instant.from(e.end).since(Temporal.Instant.from(e.start));
		for (const [rid, o] of Object.entries(e.overrides)) {
			if (o.cancelled) continue;
			const original = localIn(rid, zone);
			const start = o.start ? inZone(o.start, zone) : original;
			cal.createEvent({
				...base,
				summary: o.title ?? e.title,
				description: (o.notes ?? e.notes) || null,
				location: (o.location ?? e.location) || null,
				recurrenceId: original,
				start,
				end: o.end ? inZone(o.end, zone) : start.add(duration)
			});
		}
	}

	return {
		calendarFeed() {
			const cal = ical({
				prodId: { company: 'selfserver', product: 'planner', language: 'RU' },
				name: 'Планировщик'
			});
			// name: null keeps DTSTAMP in UTC ("...Z") while still adding a VTIMEZONE per used zone.
			cal.timezone({ name: null, generator: (tz) => tzlib_get_ical_block(tz)[0] });
			cal.ttl(3600);
			const ids = db.prepare('SELECT id FROM event ORDER BY id').all() as { id: number }[];
			for (const { id } of ids) addEvent(cal, getEvent(id));
			return cal.toString();
		}
	};
}
