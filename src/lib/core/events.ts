/**
 * Events: one-off appointments (recurrence comes later, ticket #10; the `recurrence` column is
 * reserved for it) and the agenda query.
 *
 * Time rules:
 *  - a timed Event is stored as UTC instants (`start_at`/`end_at`) plus its own IANA `time_zone`;
 *  - an all-day Event is stored as local dates (`start_date`/`end_date`, end INCLUSIVE) with no
 *    instants; in the agenda it occupies whole days of the Home time zone;
 *  - wall-clock input without an offset ("2026-03-29T09:30") is read in the Event's own zone.
 */
import type { Actor, CoreContext } from './context.js';

export interface Event {
	id: number;
	title: string;
	notes: string;
	location: string;
	allDay: boolean;
	/** IANA zone the Event lives in (Home zone unless set). */
	timeZone: string;
	/** Timed: UTC instant ("2026-03-29T06:30:00Z"). All-day: first local date ("2026-03-29"). */
	start: string;
	/** Timed: UTC instant. All-day: LAST local date, inclusive. */
	end: string;
	/** Wall clock in the Event's own zone ("2026-03-29T09:30"); for all-day the same date as `start`. */
	startLocal: string;
	endLocal: string;
	/** Wall clock in the Home zone; for all-day the same date as `start`. */
	startHome: string;
	endHome: string;
	/** Reserved for recurring Events (ticket #10); always null for one-off Events. */
	recurrence: string | null;
	createdAt: string;
	updatedAt: string;
}

/**
 * One entry of the agenda. A typed list so that later tickets (Tasks, #9) can add more `kind`s
 * without changing the shape of the result.
 */
export type AgendaItem = Event & { kind: 'event' };

export interface EventInput {
	title: string;
	notes?: string;
	location?: string;
	/** IANA zone; defaults to the Home zone. */
	timeZone?: string;
	allDay?: boolean;
	/** Timed: ISO instant (with Z/offset) or wall clock in `timeZone`. All-day: "YYYY-MM-DD". */
	start: string;
	/** Same formats. Timed default: start + 1 hour. All-day default: same day as start (inclusive). */
	end?: string;
}

export interface EventApi {
	createEvent(actor: Actor, input: EventInput): Event;
	/** Only the given fields change. Changing `allDay` requires a new `start`. */
	updateEvent(actor: Actor, id: number, patch: Partial<EventInput>): Event;
	getEvent(id: number): Event;
	/**
	 * Everything overlapping [from, to), ordered by start. `from`/`to` are ISO strings: date-only
	 * means a local Home date (`to` as a date is INCLUSIVE, so from=to="2026-01-05" is that whole
	 * day); a datetime with Z/offset is an instant; a datetime without offset is Home wall clock
	 * (and `to` is then exclusive).
	 */
	agenda(from: string, to: string): AgendaItem[];
	/** Today's local date in the Home zone ("YYYY-MM-DD"). */
	today(): string;
}

interface EventRow {
	id: number;
	title: string;
	notes: string;
	location: string;
	all_day: number;
	time_zone: string;
	start_at: string | null;
	end_at: string | null;
	start_date: string | null;
	end_date: string | null;
	recurrence: string | null;
	created_at: string;
	updated_at: string;
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const HAS_OFFSET = /(Z|[+-]\d{2}(:?\d{2})?)$/i;

function checkZone(zone: string): string {
	try {
		new Intl.DateTimeFormat('en', { timeZone: zone });
		return zone;
	} catch {
		throw new Error(`Unknown time zone "${zone}" (use an IANA name like Europe/Istanbul)`);
	}
}

function parseDate(s: string): Temporal.PlainDate {
	if (!DATE_ONLY.test(s)) throw new Error(`"${s}" is not a date (use YYYY-MM-DD)`);
	try {
		return Temporal.PlainDate.from(s);
	} catch {
		throw new Error(`"${s}" is not a valid date`);
	}
}

/** Instant for a datetime string: offset form is absolute, otherwise wall clock in `zone`. */
function parseInstant(s: string, zone: string): Temporal.Instant {
	if (DATE_ONLY.test(s)) throw new Error(`"${s}" has no time; give a date and time or set allDay`);
	try {
		if (HAS_OFFSET.test(s)) return Temporal.Instant.from(s);
		return Temporal.PlainDateTime.from(s).toZonedDateTime(zone).toInstant();
	} catch {
		throw new Error(`"${s}" is not a valid date and time (use YYYY-MM-DDTHH:MM)`);
	}
}

const wall = (i: Temporal.Instant, zone: string) =>
	i.toZonedDateTimeISO(zone).toPlainDateTime().toString({ smallestUnit: 'minute' });

const dayStart = (d: Temporal.PlainDate, zone: string) => d.toZonedDateTime(zone).epochMilliseconds;

export function eventModule({ db, nowIso, atomically, record, homeTimeZone, clock, entities }: CoreContext): EventApi {
	const toEvent = (r: EventRow): Event => {
		const base = {
			id: r.id,
			title: r.title,
			notes: r.notes,
			location: r.location,
			timeZone: r.time_zone,
			recurrence: r.recurrence,
			createdAt: r.created_at,
			updatedAt: r.updated_at
		};
		if (r.all_day) {
			return {
				...base,
				allDay: true,
				start: r.start_date!,
				end: r.end_date!,
				startLocal: r.start_date!,
				endLocal: r.end_date!,
				startHome: r.start_date!,
				endHome: r.end_date!
			};
		}
		const s = Temporal.Instant.from(r.start_at!);
		const e = Temporal.Instant.from(r.end_at!);
		return {
			...base,
			allDay: false,
			start: s.toString(),
			end: e.toString(),
			startLocal: wall(s, r.time_zone),
			endLocal: wall(e, r.time_zone),
			startHome: wall(s, homeTimeZone),
			endHome: wall(e, homeTimeZone)
		};
	};

	function row(id: number): EventRow {
		const r = db.prepare('SELECT * FROM event WHERE id = ?').get(id) as EventRow | undefined;
		if (!r) throw new Error(`Event ${id} not found`);
		return r;
	}

	/** Validate an input and turn it into column values. */
	function columns(input: EventInput) {
		const title = input.title.trim();
		if (!title) throw new Error('Event title must not be empty');
		const timeZone = checkZone(input.timeZone ?? homeTimeZone);
		const common = {
			title,
			notes: input.notes ?? '',
			location: input.location ?? '',
			time_zone: timeZone
		};
		if (input.allDay) {
			const s = parseDate(input.start);
			const e = input.end === undefined ? s : parseDate(input.end);
			if (Temporal.PlainDate.compare(e, s) < 0) throw new Error('Event end must not be before start');
			return {
				...common,
				all_day: 1,
				start_at: null,
				end_at: null,
				start_date: s.toString(),
				end_date: e.toString()
			};
		}
		const s = parseInstant(input.start, timeZone);
		const e = input.end === undefined ? s.add({ hours: 1 }) : parseInstant(input.end, timeZone);
		if (Temporal.Instant.compare(e, s) < 0) throw new Error('Event end must not be before start');
		return {
			...common,
			all_day: 0,
			start_at: s.toString(),
			end_at: e.toString(),
			start_date: null,
			end_date: null
		};
	}

	const span = (e: Event): [number, number] =>
		e.allDay
			? [
					dayStart(Temporal.PlainDate.from(e.start), homeTimeZone),
					dayStart(Temporal.PlainDate.from(e.end).add({ days: 1 }), homeTimeZone)
				]
			: [
					Temporal.Instant.from(e.start).epochMilliseconds,
					Temporal.Instant.from(e.end).epochMilliseconds
				];

	const insertSql = `INSERT INTO event
		(title, notes, location, all_day, time_zone, start_at, end_at, start_date, end_date, created_at, updated_at)
		VALUES (@title, @notes, @location, @all_day, @time_zone, @start_at, @end_at, @start_date, @end_date, @now, @now)`;

	// Makes Events trashable and undoable (see README "How to make a new entity trashable and undoable").
	// The snapshot is the full Event (all columns incl. recurrence, plus derived views of them).
	entities.register<Event>({
		type: 'event',
		read: (id) => {
			const r = db.prepare('SELECT * FROM event WHERE id = ?').get(id) as EventRow | undefined;
			return r ? toEvent(r) : null;
		},
		write: (e) => {
			db.prepare(
				`INSERT OR REPLACE INTO event
				 (id, title, notes, location, all_day, time_zone, start_at, end_at, start_date, end_date,
				  recurrence, created_at, updated_at)
				 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
			).run(
				e.id,
				e.title,
				e.notes,
				e.location,
				e.allDay ? 1 : 0,
				e.timeZone,
				e.allDay ? null : e.start,
				e.allDay ? null : e.end,
				e.allDay ? e.start : null,
				e.allDay ? e.end : null,
				e.recurrence,
				e.createdAt,
				e.updatedAt
			);
		},
		remove: (id) => void db.prepare('DELETE FROM event WHERE id = ?').run(id),
		label: (e) => e.title
	});

	return {
		createEvent(actor, input) {
			const cols = columns(input);
			return atomically(() => {
				const { lastInsertRowid } = db.prepare(insertSql).run({ ...cols, now: nowIso() });
				const event = toEvent(row(Number(lastInsertRowid)));
				record(actor, 'event.create', 'event', event.id, null, event);
				return event;
			});
		},
		updateEvent(actor, id, patch) {
			return atomically(() => {
				const before = toEvent(row(id));
				const allDay = patch.allDay ?? before.allDay;
				const flipped = allDay !== before.allDay;
				if (flipped && patch.start === undefined) {
					throw new Error('Changing allDay requires a new start');
				}
				const cols = columns({
					title: patch.title ?? before.title,
					notes: patch.notes ?? before.notes,
					location: patch.location ?? before.location,
					timeZone: patch.timeZone ?? before.timeZone,
					allDay,
					start: patch.start ?? before.start,
					end: patch.end ?? (flipped ? undefined : before.end)
				});
				db.prepare(
					`UPDATE event SET title=@title, notes=@notes, location=@location, all_day=@all_day,
					 time_zone=@time_zone, start_at=@start_at, end_at=@end_at, start_date=@start_date,
					 end_date=@end_date, updated_at=@now WHERE id=@id`
				).run({ ...cols, now: nowIso(), id });
				const after = toEvent(row(id));
				record(actor, 'event.update', 'event', id, before, after);
				return after;
			});
		},
		getEvent: (id) => toEvent(row(id)),
		agenda(from, to) {
			const lo = DATE_ONLY.test(from)
				? dayStart(parseDate(from), homeTimeZone)
				: parseInstant(from, homeTimeZone).epochMilliseconds;
			const hi = DATE_ONLY.test(to)
				? dayStart(parseDate(to).add({ days: 1 }), homeTimeZone)
				: parseInstant(to, homeTimeZone).epochMilliseconds;
			if (hi < lo || (DATE_ONLY.test(to) && hi === lo)) throw new Error('Agenda range end is before its start');
			const rows = db
				.prepare('SELECT * FROM event')
				.all() as unknown as EventRow[];
			return rows
				.map(toEvent)
				.map((e) => ({ e, span: span(e) }))
				.filter(({ span: [s, en] }) => s < hi && (en > lo || (en === s && s >= lo)))
				.sort((a, b) => a.span[0] - b.span[0] || a.e.id - b.e.id)
				.map(({ e }) => ({ kind: 'event' as const, ...e }));
		},
		today: () =>
			clock.now().toTemporalInstant().toZonedDateTimeISO(homeTimeZone).toPlainDate().toString()
	};
}
