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
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import ical, { type ICalEventData } from 'ical-generator';
import { tzlib_get_ical_block } from 'timezones-ical-library';
import type { Actor, CoreContext } from './context.js';
import type { Event, EventApi } from './events.js';
import { toRfcRule } from './recurrence.js';
import type { TaskApi } from './tasks.js';

export interface FeedApi {
	/** The whole feed as iCalendar text. */
	calendarFeed(): string;
	/** The secret in the feed URL (`/feed/<secret>.ics`). Random, stored in the database. */
	feedSecret(): string;
	/** Whether `candidate` is the current secret. Compares in constant time. */
	isFeedSecret(candidate: string): boolean;
	/** Replace the secret; the old URL stops working. Logged (without the secret itself). Returns the new secret. */
	regenerateFeedSecret(actor: Actor): string;
}

/** Zoned time for a stored UTC instant. ical-generator formats ZonedDateTime without touching the process zone. */
const inZone = (instant: string, zone: string) => Temporal.Instant.from(instant).toZonedDateTimeISO(zone);
const localIn = (wall: string, zone: string) => Temporal.PlainDateTime.from(wall).toZonedDateTime(zone);
/** A calendar date as the UTC-midnight Date that ical-generator prints as VALUE=DATE. */
const dateValue = (d: string) => new Date(`${d}T00:00:00Z`);
const compact = (wall: string) =>
	Temporal.PlainDateTime.from(wall).toString({ smallestUnit: 'second' }).replace(/[-:]/g, '');

export function feedModule(
	{ db, homeTimeZone, atomically, record }: CoreContext,
	{ getEvent }: Pick<EventApi, 'getEvent'>,
	{ listTasks }: Pick<TaskApi, 'listTasks'>
): FeedApi {
	type Calendar = ReturnType<typeof ical>;

	/** When an Event (or one occurrence of it) happens, in the shape ical-generator wants. */
	function when(e: Event, start: string, end: string): Pick<ICalEventData, 'start' | 'end' | 'allDay' | 'timezone'> {
		if (e.allDay) {
			// Dates print as VALUE=DATE; iCal's DTEND is the day AFTER the last day.
			return { allDay: true, start: dateValue(start), end: dateValue(Temporal.PlainDate.from(end).add({ days: 1 }).toString()) };
		}
		return { timezone: e.timeZone, start: inZone(start, e.timeZone), end: inZone(end, e.timeZone) };
	}

	function addEvent(cal: Calendar, e: Event) {
		const id = `event-${e.id}@planner`;
		const zone = e.timeZone;
		const base = {
			id,
			summary: e.title,
			description: e.notes || null,
			location: e.location || null,
			...when(e, e.start, e.end)
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
			.map(([rid]) =>
				e.allDay ? `EXDATE;VALUE=DATE:${rid.replaceAll('-', '')}` : `EXDATE;TZID=${zone}:${compact(rid)}`
			);
		cal.createEvent({ ...base, repeating: [`RRULE:${rule}`, ...exdates].join('\n') });

		for (const [rid, o] of Object.entries(e.overrides)) {
			if (o.cancelled) continue;
			let start: string;
			let end: string;
			let recurrenceId: ICalEventData['recurrenceId'];
			if (e.allDay) {
				const length = Temporal.PlainDate.from(e.start).until(Temporal.PlainDate.from(e.end));
				start = o.start ?? rid;
				end = o.end ?? Temporal.PlainDate.from(start).add(length).toString();
				recurrenceId = dateValue(rid);
			} else {
				const original = localIn(rid, zone);
				const duration = Temporal.Instant.from(e.end).since(Temporal.Instant.from(e.start));
				start = o.start ?? original.toInstant().toString();
				end = o.end ?? Temporal.Instant.from(start).add(duration).toString();
				recurrenceId = original;
			}
			cal.createEvent({
				...base,
				summary: o.title ?? e.title,
				description: (o.notes ?? e.notes) || null,
				location: (o.location ?? e.location) || null,
				recurrenceId,
				...when(e, start, end)
			});
		}
	}

	const feedSecret = () => (db.prepare('SELECT secret FROM feed_secret WHERE id = 1').get() as { secret: string }).secret;
	const digest = (s: string) => createHash('sha256').update(s).digest();

	return {
		feedSecret,
		isFeedSecret: (candidate) => timingSafeEqual(digest(candidate), digest(feedSecret())),
		regenerateFeedSecret(actor) {
			return atomically(() => {
				const secret = randomBytes(32).toString('hex');
				db.prepare('UPDATE feed_secret SET secret = ? WHERE id = 1').run(secret);
				// The secret is deliberately NOT written to the Change log (it is shown in the UI).
				record(actor, 'feed.regenerate', 'feed', 1, null, null);
				return secret;
			});
		},
		calendarFeed() {
			const cal = ical({
				prodId: { company: 'selfserver', product: 'planner', language: 'RU' },
				// Intentional exception to "no Russian in core": the feed is the owner's own calendar content
				// (see README, Calendar feed), not UI chrome, so its fixed texts are Russian.
				name: 'Планировщик'
			});
			// name: null keeps DTSTAMP in UTC ("...Z") while still adding a VTIMEZONE per used zone.
			cal.timezone({ name: null, generator: (tz) => tzlib_get_ical_block(tz)[0] });
			cal.ttl(3600);
			const ids = db.prepare('SELECT id FROM event ORDER BY id').all() as { id: number }[];
			for (const { id } of ids) addEvent(cal, getEvent(id));
			for (const t of listTasks()) {
				if (t.completedAt || !t.timeBlock) continue;
				const start = inZone(t.timeBlock.start, homeTimeZone);
				cal.createEvent({
					id: `task-${t.id}@planner`,
					summary: `[Задача] ${t.title}`,
					timezone: homeTimeZone,
					start,
					end: start.add({ minutes: t.timeBlock.minutes })
				});
			}
			// ical-generator has no date-only RECURRENCE-ID: it prints midnight UTC. The id must have the
			// same form as DTSTART (a date), or calendar apps cannot match the override to its occurrence.
			// Timed overrides always carry TZID, so only all-day ones match this pattern.
			return cal.toString().replace(/^RECURRENCE-ID:(\d{8})T000000Z$/gm, 'RECURRENCE-ID;VALUE=DATE:$1');
		}
	};
}
