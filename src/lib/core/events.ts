/**
 * Events (one-off and recurring) and the agenda query.
 *
 * Time rules:
 *  - a timed Event is stored as UTC instants (`start_at`/`end_at`) plus its own IANA `time_zone`;
 *  - an all-day Event is stored as local dates (`start_date`/`end_date`, end INCLUSIVE) with no
 *    instants; in the agenda it occupies whole days of the Home time zone;
 *  - wall-clock input without an offset ("2026-03-29T09:30") is read in the Event's own zone.
 *
 * Recurrence: a recurring Event is ONE row: its first occurrence plus an RFC 5545 RRULE
 * (`recurrence`, e.g. "FREQ=WEEKLY;BYDAY=MO,WE;COUNT=10"). Occurrences are never stored; `agenda()`
 * expands them for the requested range (rules and DST live in recurrence.ts). One occurrence is
 * addressed by its `recurrenceId`: its ORIGINAL wall-clock start ("2026-03-30T09:00"; all-day:
 * "2026-03-30"). Changes to single occurrences (cancel = EXDATE, edit = override) live in the row's
 * `overrides`, so the whole series is one snapshot and Trash/undo need nothing special.
 */
import type { Actor, CoreContext } from './context.js';
import {
	normalizeRule,
	occurrenceAt,
	occurrencesBetween,
	ruleContinuingFrom,
	ruleEndingBefore,
	type RuleSpec
} from './recurrence.js';

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
	/** RFC 5545 RRULE value ("FREQ=DAILY;COUNT=5") for a recurring Event, else null. start/end are then its FIRST occurrence. */
	recurrence: string | null;
	/** Changes to single occurrences of a recurring Event, keyed by recurrenceId. Empty for one-off Events. */
	overrides: Record<string, OccurrenceOverride>;
	createdAt: string;
	updatedAt: string;
}

/** What differs in one occurrence. `start`/`end` use the Event formats (UTC instants, or dates when all-day). */
export interface OccurrenceOverride {
	/** The occurrence is skipped (an EXDATE in iCal terms). */
	cancelled?: true;
	title?: string;
	notes?: string;
	location?: string;
	start?: string;
	end?: string;
}

/**
 * One entry of the agenda. The agenda is a typed list (`kind`), so more sources can join without changing its shape. For a recurring Event each occurrence is one item:
 * `id` is the series, `recurrenceId` the occurrence, start/end the occurrence's own times.
 */
export type EventAgendaItem = Omit<Event, 'overrides'> & { kind: 'event'; recurrenceId: string | null };

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
	/**
	 * RFC 5545 RRULE value (with or without "RRULE:"), e.g. "FREQ=WEEKLY;BYDAY=MO,WE;UNTIL=2026-06-30"
	 * (UNTIL is an inclusive local date or RFC UTC time). `null` on update makes the Event one-off.
	 * Only DAILY, WEEKLY, MONTHLY and YEARLY.
	 */
	recurrence?: string | null;
}

export type OccurrencePatch = Partial<Pick<EventInput, 'title' | 'notes' | 'location' | 'start' | 'end'>>;

export interface EventApi {
	createEvent(actor: Actor, input: EventInput): Event;
	/**
	 * Only the given fields change; for a recurring Event this edits the WHOLE series. Changing
	 * allDay requires a new start. Changing start, zone, allDay or the rule clears the series'
	 * single-occurrence changes (their ids would no longer match).
	 */
	updateEvent(actor: Actor, id: number, patch: Partial<EventInput>): Event;
	getEvent(id: number): Event;
	/** One occurrence of a recurring Event as an agenda item. Throws if the rule does not produce it or it is cancelled. */
	getOccurrence(id: number, recurrenceId: string): EventAgendaItem;
	/** Change one occurrence only. Moving it (start/end) is allowed; `end` defaults to keeping the duration. */
	updateOccurrence(actor: Actor, id: number, recurrenceId: string, patch: OccurrencePatch): Event;
	/** Skip one occurrence. Undo of the change brings it back. */
	cancelOccurrence(actor: Actor, id: number, recurrenceId: string): Event;
	/**
	 * "This and following": the series is cut before `recurrenceId` and a NEW series (returned) starts
	 * there with the patch applied. Overrides after the cut move to the new series unless the patch
	 * changes timing or rule. Logs ONE entry, `event.split` on the old series, whose snapshots carry the new series (`splitTail`), so one undo removes the new series again.
	 * At the first occurrence it is simply `updateEvent` and returns the same series.
	 */
	updateFollowing(actor: Actor, id: number, recurrenceId: string, patch: Partial<EventInput>): Event;
	/**
	 * Events whose title, notes or location contain `text` (case-insensitive). Without a range: each matching Event
	 * once (a recurring one as its series, `recurrenceId` null). With `from` and `to` (both; same formats as `agenda`): the matching occurrences overlapping that range, recurring Events expanded. Needs text or a range.
	 */
	searchEvents(opts: { text?: string; from?: string; to?: string }): EventAgendaItem[];
	/**
	 * Everything overlapping [from, to), ordered by start, recurring Events expanded into their
	 * occurrences. `from`/`to` are ISO strings: date-only
	 * means a local Home date (`to` as a date is INCLUSIVE, so from=to="2026-01-05" is that whole
	 * day); a datetime with Z/offset is an instant; a datetime without offset is Home wall clock
	 * (and `to` is then exclusive).
	 */
	agenda(from: string, to: string): EventAgendaItem[];
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
	overrides: string;
	split_tail: string | null;
	created_at: string;
	updated_at: string;
}

/**
 * What the Change log and Trash store for an Event: the Event plus, for the HEAD of a "this and
 * following" split, the full snapshot of the new series (`splitTail`). That makes a split ONE entry
 * (one undo removes the new series again, redo re-creates it with the same id).
 */
export type EventSnapshot = Event & { splitTail: Event | null };

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const HAS_OFFSET = /(Z|[+-]\d{2}(:?\d{2})?)$/i;
const DAY_MS = 24 * 60 * 60 * 1000;

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
			overrides: JSON.parse(r.overrides) as Record<string, OccurrenceOverride>,
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

	const snapshotOf = (r: EventRow): EventSnapshot => ({
		...toEvent(r),
		splitTail: r.split_tail === null ? null : (JSON.parse(r.split_tail) as Event)
	});
	/** The registry snapshot of an Event; what every command passes to `record`. */
	const snap = (id: number) => snapshotOf(row(id));

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
			time_zone: timeZone,
			recurrence: input.recurrence ? normalizeRule(input.recurrence) : null
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

	const span = (e: Pick<Event, 'allDay' | 'start' | 'end'>): [number, number] =>
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
		(title, notes, location, all_day, time_zone, start_at, end_at, start_date, end_date, recurrence, overrides, created_at, updated_at)
		VALUES (@title, @notes, @location, @all_day, @time_zone, @start_at, @end_at, @start_date, @end_date, @recurrence, @overrides, @now, @now)`;

	// Makes Events trashable and undoable (see README "How to make a new entity trashable and undoable").
	// The snapshot is the full Event (all columns incl. recurrence and overrides, plus derived views of them).
	const eventExists = (id: number) => db.prepare('SELECT 1 FROM event WHERE id = ?').get(id) !== undefined;
	const eventInTrash = (id: number) =>
		db.prepare("SELECT 1 FROM trash WHERE entity_type = 'event' AND entity_id = ?").get(id) !== undefined;

	function writeRow(e: Event, splitTail: Event | null) {
		{
			db.prepare(
				`INSERT OR REPLACE INTO event
				 (id, title, notes, location, all_day, time_zone, start_at, end_at, start_date, end_date,
				  recurrence, overrides, split_tail, created_at, updated_at)
				 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
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
				JSON.stringify(e.overrides ?? {}),
				splitTail === null ? null : JSON.stringify(splitTail),
				e.createdAt,
				e.updatedAt
			);
		}
	}

	/** Takes the new series of a split away again; refuses if it was touched since (any logged change). */
	function dropSplitTail(id: number) {
		if (!eventExists(id)) {
			// Deleted by hand: make sure restoring it later cannot produce a duplicate.
			db.prepare("DELETE FROM trash WHERE entity_type = 'event' AND entity_id = ?").run(id);
			return;
		}
		const touched = db
			.prepare("SELECT 1 FROM change_log WHERE entity_type = 'event' AND entity_id = ?")
			.get(id);
		if (touched) {
			throw new Error(`the new series (event #${id}) was already changed; deal with it first`);
		}
		db.prepare('DELETE FROM event WHERE id = ?').run(id);
	}

	entities.register<EventSnapshot>({
		type: 'event',
		read: (id) => {
			const r = db.prepare('SELECT * FROM event WHERE id = ?').get(id) as EventRow | undefined;
			return r ? snapshotOf(r) : null;
		},
		write: (snapshot) => {
			const { splitTail, ...e } = snapshot;
			const previous = db.prepare('SELECT split_tail FROM event WHERE id = ?').get(e.id) as
				| { split_tail: string | null }
				| undefined;
			const previousTailId = previous?.split_tail ? (JSON.parse(previous.split_tail) as Event).id : null;
			writeRow(e, splitTail ?? null);
			// The head of a split and its new series go together (like a repeating Task and its next instance).
			if (previousTailId !== null && previousTailId !== (splitTail?.id ?? null)) dropSplitTail(previousTailId);
			if (splitTail && !eventExists(splitTail.id) && !eventInTrash(splitTail.id)) writeRow(splitTail, null);
		},
		remove: (id) => void db.prepare('DELETE FROM event WHERE id = ?').run(id),
		label: (e) => e.title
	});

	// ---- recurrence helpers ----

	const item = (e: Event, recurrenceId: string | null): EventAgendaItem => {
		const { overrides: _overrides, ...rest } = e;
		return { kind: 'event', ...rest, recurrenceId };
	};

	/** The series' rule as the recurrence module wants it. All-day series expand at local midnight. */
	const specOf = (e: Event): RuleSpec => ({
		rrule: e.recurrence!,
		startLocal: e.allDay ? `${e.start}T00:00` : e.startLocal,
		timeZone: e.timeZone
	});
	const cutoffOf = (recurrenceId: string) =>
		DATE_ONLY.test(recurrenceId) ? `${recurrenceId}T00:00` : recurrenceId;

	/** Check that `recurrenceId` names a real, current occurrence of the series; returns its canonical form. */
	function checkOccurrence(e: Event, recurrenceId: string): string {
		if (!e.recurrence) throw new Error(`Event ${e.id} is not recurring`);
		let rid: string;
		try {
			rid = e.allDay
				? Temporal.PlainDate.from(recurrenceId).toString()
				: Temporal.PlainDateTime.from(recurrenceId).toString({ smallestUnit: 'minute' });
		} catch {
			throw new Error(
				`"${recurrenceId}" is not a recurrenceId (use the occurrence's original start, ${e.allDay ? 'YYYY-MM-DD' : 'YYYY-MM-DDTHH:MM'})`
			);
		}
		if (!occurrenceAt(specOf(e), cutoffOf(rid))) {
			throw new Error(`${rid} is not an occurrence of Event ${e.id}`);
		}
		return rid;
	}

	/** The occurrence as an agenda item, with its override applied. Does not check the rule. */
	function occurrenceItem(e: Event, rid: string): EventAgendaItem {
		const o = e.overrides[rid] ?? {};
		let start: string;
		let end: string;
		if (o.start && o.end) {
			({ start, end } = o);
		} else if (e.allDay) {
			const days = Temporal.PlainDate.from(e.start).until(Temporal.PlainDate.from(e.end)).days;
			start = rid;
			end = Temporal.PlainDate.from(rid).add({ days }).toString();
		} else {
			const dur = Temporal.Instant.from(e.end).epochMilliseconds - Temporal.Instant.from(e.start).epochMilliseconds;
			const s = Temporal.PlainDateTime.from(rid).toZonedDateTime(e.timeZone).toInstant();
			start = s.toString();
			end = s.add({ milliseconds: dur }).toString();
		}
		const r: EventRow = {
			id: e.id,
			time_zone: e.timeZone,
			all_day: e.allDay ? 1 : 0,
			recurrence: e.recurrence,
			overrides: '{}',
			split_tail: null,
			created_at: e.createdAt,
			updated_at: e.updatedAt,
			title: o.title ?? e.title,
			notes: o.notes ?? e.notes,
			location: o.location ?? e.location,
			start_at: e.allDay ? null : start,
			end_at: e.allDay ? null : end,
			start_date: e.allDay ? start : null,
			end_date: e.allDay ? end : null
		};
		return item(toEvent(r), rid);
	}

	/** Occurrences that might overlap [lo, hi): a generous superset; the caller filters by overlap. */
	function expand(e: Event, lo: number, hi: number): EventAgendaItem[] {
		const len = e.allDay
			? (Temporal.PlainDate.from(e.start).until(Temporal.PlainDate.from(e.end)).days + 1) * DAY_MS
			: Temporal.Instant.from(e.end).epochMilliseconds - Temporal.Instant.from(e.start).epochMilliseconds;
		const ids = new Set(
			occurrencesBetween(specOf(e), lo - len - 2 * DAY_MS, hi).map((o) =>
				e.allDay ? o.recurrenceId.slice(0, 10) : o.recurrenceId
			)
		);
		for (const k of Object.keys(e.overrides)) ids.add(k); // occurrences moved into the range
		return [...ids].filter((rid) => !e.overrides[rid]?.cancelled).map((rid) => occurrenceItem(e, rid));
	}

	/** End for a moved start that keeps the occurrence's length. */
	function shiftedEnd(base: EventAgendaItem, newStart: string): string {
		if (base.allDay) {
			const days = Temporal.PlainDate.from(base.start).until(Temporal.PlainDate.from(base.end)).days;
			return parseDate(newStart).add({ days }).toString();
		}
		const dur = Temporal.Instant.from(base.end).epochMilliseconds - Temporal.Instant.from(base.start).epochMilliseconds;
		return parseInstant(newStart, base.timeZone).add({ milliseconds: dur }).toString();
	}

	const writeOverrides = (id: number, overrides: Record<string, OccurrenceOverride>) =>
		db
			.prepare('UPDATE event SET overrides = ?, updated_at = ? WHERE id = ?')
			.run(JSON.stringify(overrides), nowIso(), id);

	function insertEvent(cols: ReturnType<typeof columns>, overrides: Record<string, OccurrenceOverride>) {
		const { lastInsertRowid } = db
			.prepare(insertSql)
			.run({ ...cols, overrides: JSON.stringify(overrides), now: nowIso() });
		return toEvent(row(Number(lastInsertRowid)));
	}

	function updateWhole(actor: Actor, id: number, patch: Partial<EventInput>): Event {
		return atomically(() => {
			const before = snap(id);
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
				end: patch.end ?? (flipped ? undefined : before.end),
				recurrence: patch.recurrence === undefined ? before.recurrence : patch.recurrence
			});
			const startLocal = cols.all_day
				? cols.start_date
				: wall(Temporal.Instant.from(cols.start_at!), cols.time_zone);
			const sameTiming =
				cols.recurrence === before.recurrence &&
				cols.time_zone === before.timeZone &&
				Boolean(cols.all_day) === before.allDay &&
				startLocal === before.startLocal;
			db.prepare(
				`UPDATE event SET title=@title, notes=@notes, location=@location, all_day=@all_day,
				 time_zone=@time_zone, start_at=@start_at, end_at=@end_at, start_date=@start_date,
				 end_date=@end_date, recurrence=@recurrence, overrides=@overrides, updated_at=@now WHERE id=@id`
			).run({
				...cols,
				overrides: JSON.stringify(sameTiming ? before.overrides : {}),
				now: nowIso(),
				id
			});
			const after = snap(id);
			record(actor, 'event.update', 'event', id, before, after);
			return after;
		});
	}

	return {
		createEvent(actor, input) {
			const cols = columns(input);
			return atomically(() => {
				const event = insertEvent(cols, {});
				record(actor, 'event.create', 'event', event.id, null, snap(event.id));
				return event;
			});
		},
		updateEvent: updateWhole,
		getEvent: (id) => toEvent(row(id)),
		getOccurrence(id, recurrenceId) {
			const e = toEvent(row(id));
			const rid = checkOccurrence(e, recurrenceId);
			if (e.overrides[rid]?.cancelled) throw new Error(`Occurrence ${rid} of Event ${id} is cancelled`);
			return occurrenceItem(e, rid);
		},
		updateOccurrence(actor, id, recurrenceId, patch) {
			return atomically(() => {
				const before = snap(id);
				const rid = checkOccurrence(before, recurrenceId);
				if (before.overrides[rid]?.cancelled) {
					throw new Error(`Occurrence ${rid} of Event ${id} is cancelled`);
				}
				const base = occurrenceItem(before, rid);
				const next: OccurrenceOverride = { ...before.overrides[rid] };
				if (patch.title !== undefined) {
					if (!patch.title.trim()) throw new Error('Event title must not be empty');
					next.title = patch.title.trim();
				}
				if (patch.notes !== undefined) next.notes = patch.notes;
				if (patch.location !== undefined) next.location = patch.location;
				if (patch.start !== undefined || patch.end !== undefined) {
					const start = patch.start ?? base.start;
					const end = patch.end ?? (patch.start !== undefined ? shiftedEnd(base, start) : base.end);
					const cols = columns({ title: base.title, timeZone: base.timeZone, allDay: base.allDay, start, end });
					next.start = (base.allDay ? cols.start_date : cols.start_at)!;
					next.end = (base.allDay ? cols.end_date : cols.end_at)!;
				}
				writeOverrides(id, { ...before.overrides, [rid]: next });
				const after = snap(id);
				record(actor, 'event.occurrence.update', 'event', id, before, after);
				return after;
			});
		},
		cancelOccurrence(actor, id, recurrenceId) {
			return atomically(() => {
				const before = snap(id);
				const rid = checkOccurrence(before, recurrenceId);
				if (before.overrides[rid]?.cancelled) return before;
				writeOverrides(id, { ...before.overrides, [rid]: { cancelled: true } });
				const after = snap(id);
				record(actor, 'event.occurrence.cancel', 'event', id, before, after);
				return after;
			});
		},
		updateFollowing(actor, id, recurrenceId, patch) {
			const first = toEvent(row(id));
			const firstRid = checkOccurrence(first, recurrenceId);
			if (firstRid === (first.allDay ? first.start : first.startLocal)) {
				return updateWhole(actor, id, patch);
			}
			return atomically(() => {
				const before = snap(id);
				const rid = firstRid;
				if (before.overrides[rid]?.cancelled) {
					throw new Error(`Occurrence ${rid} of Event ${id} is cancelled`);
				}
				const base = occurrenceItem(before, rid);
				const spec = specOf(before);
				const cutoff = cutoffOf(rid);
				const allDay = patch.allDay ?? before.allDay;
				const flipped = allDay !== before.allDay;
				if (flipped && patch.start === undefined) {
					throw new Error('Changing allDay requires a new start');
				}
				const start = patch.start ?? base.start;
				const end = patch.end ?? (flipped ? undefined : patch.start !== undefined ? shiftedEnd(base, start) : base.end);
				const recurrence =
					patch.recurrence === undefined ? ruleContinuingFrom(spec, cutoff) : patch.recurrence;
				const cols = columns({
					title: patch.title ?? base.title,
					notes: patch.notes ?? base.notes,
					location: patch.location ?? base.location,
					timeZone: patch.timeZone ?? before.timeZone,
					allDay,
					start,
					end,
					recurrence
				});
				const retimed =
					patch.start !== undefined ||
					patch.timeZone !== undefined ||
					patch.allDay !== undefined ||
					patch.recurrence !== undefined ||
					before.overrides[rid]?.start !== undefined;
				const keep = (pick: (k: string) => boolean) =>
					Object.fromEntries(Object.entries(before.overrides).filter(([k]) => pick(k)));

				const headRule = ruleEndingBefore(spec, cutoff);
				db.prepare('UPDATE event SET recurrence = ?, overrides = ?, updated_at = ? WHERE id = ?').run(
					headRule,
					JSON.stringify(keep((k) => k < rid)),
					nowIso(),
					id
				);
				const tail = insertEvent(cols, retimed ? {} : keep((k) => k > rid));
				db.prepare('UPDATE event SET split_tail = ? WHERE id = ?').run(JSON.stringify(tail), id);
				record(actor, 'event.split', 'event', id, before, snap(id));
				return tail;
			});
		},
		agenda,
		searchEvents({ text = '', from, to }) {
			const needle = text.trim().toLowerCase();
			if (!needle && from === undefined && to === undefined) return [];
			const matches = (e: Pick<Event, 'title' | 'notes' | 'location'>) =>
				!needle || [e.title, e.notes, e.location].some((f) => f.toLowerCase().includes(needle));
			if (from === undefined && to === undefined) {
				const rows = db.prepare('SELECT * FROM event ORDER BY start_at, start_date, id').all() as unknown as EventRow[];
				return rows.map(toEvent).filter(matches).map((e) => item(e, null));
			}
			if (from === undefined || to === undefined) throw new Error('Give both from and to for a date range');
			return agenda(from, to).filter(matches);
		},
		today: () =>
			clock.now().toTemporalInstant().toZonedDateTimeISO(homeTimeZone).toPlainDate().toString()
	};
	function agenda(from: string, to: string): EventAgendaItem[] {
		{
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
				.flatMap((e) => (e.recurrence ? expand(e, lo, hi) : [item(e, null)]))
				.map((e) => ({ e, span: span(e) }))
				.filter(({ span: [s, en] }) => s < hi && (en > lo || (en === s && s >= lo)))
				.sort((a, b) => a.span[0] - b.span[0] || a.e.id - b.e.id)
				.map(({ e }) => e);
		}
	}
}
