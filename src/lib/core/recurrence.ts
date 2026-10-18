/**
 * RRULE parsing and expansion, independent of Events (Tasks with a fixed schedule reuse it, and the
 * iCal feed exports the same rule text).
 *
 * A rule is described by a RuleSpec: the RFC 5545 RRULE value ("FREQ=WEEKLY;BYDAY=MO,WE;COUNT=10",
 * without the "RRULE:" prefix), the first occurrence as a WALL CLOCK ("2026-03-25T09:00") and the
 * IANA zone that wall clock lives in. Together they are DTSTART;TZID=zone + RRULE. Wall-clock time
 * stays the same across DST changes (09:00 Kyiv is 09:00 before and after the switch).
 *
 * Each occurrence is identified by its `recurrenceId`: its ORIGINAL wall-clock start
 * ("2026-03-30T09:00"). That is the RECURRENCE-ID of RFC 5545 and what exceptions and overrides key on.
 *
 * Behaviour pinned by tests: an occurrence whose wall-clock time does not exist (inside the
 * spring-forward gap) is shifted, per RFC 5545 section 3.3.10, using the offset from before the gap
 * (03:30 in a 03:00-04:00 gap starts at 04:30; Temporal `disambiguation: 'compatible'`). It keeps its
 * original wall clock as `recurrenceId` and counts toward COUNT. Months without the day
 * (BYMONTHDAY=31) are skipped. A wall clock that happens twice (fall back) uses the earlier one.
 *
 * UNTIL may be written as a local date ("UNTIL=2026-06-30" or "20260630", inclusive, in the rule's
 * zone) or as RFC UTC form ("20260630T210000Z"). `toRfcRule` rewrites it to the RFC form for export.
 */
import { RRuleTemporal } from 'rrule-temporal';

export interface RuleSpec {
	/** RRULE value without "RRULE:". */
	rrule: string;
	/** First occurrence as wall clock "YYYY-MM-DDTHH:MM" (seconds allowed). */
	startLocal: string;
	timeZone: string;
}

export interface Occurrence {
	/** Original wall-clock start, minute precision: "2026-03-30T09:00". */
	recurrenceId: string;
	start: Temporal.ZonedDateTime;
}

const FREQS = ['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'];

function parts(rrule: string): [string, string][] {
	return rrule.split(';').map((p) => {
		const i = p.indexOf('=');
		if (i < 1) throw new Error(`"${rrule}" is not a valid recurrence rule (expected KEY=VALUE;...)`);
		return [p.slice(0, i).trim().toUpperCase(), p.slice(i + 1).trim().toUpperCase()];
	});
}

const join = (ps: [string, string][]) => ps.map(([k, v]) => `${k}=${v}`).join(';');

const compact = (local: string) =>
	Temporal.PlainDateTime.from(local).toString({ smallestUnit: 'second' }).replace(/[-:]/g, '');

function dtstart(spec: RuleSpec) {
	return `DTSTART;TZID=${spec.timeZone}:${compact(spec.startLocal)}`;
}

const utcCompact = (i: Temporal.Instant) =>
	i.toString({ smallestUnit: 'second' }).replace(/[-:]/g, '');

/** The moment an UNTIL value ends the rule. A bare date means the end of that local day. */
function untilInstant(value: string, zone: string): Temporal.Instant {
	const m = /^(\d{4})-?(\d{2})-?(\d{2})$/.exec(value);
	if (m) {
		return Temporal.PlainDate.from(`${m[1]}-${m[2]}-${m[3]}`)
			.add({ days: 1 })
			.toZonedDateTime(zone)
			.toInstant()
			.subtract({ seconds: 1 });
	}
	const t = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(value);
	if (!t) throw new Error(`UNTIL "${value}" is not a date (use YYYY-MM-DD)`);
	return Temporal.Instant.from(`${t[1]}-${t[2]}-${t[3]}T${t[4]}:${t[5]}:${t[6]}Z`);
}

/** Rule with UNTIL rewritten to RFC 5545 UTC form (what rrule-temporal and iCal expect). */
function withUtcUntil(rrule: string, zone: string): string {
	return join(
		parts(rrule).map(([k, v]): [string, string] =>
			k === 'UNTIL' ? [k, utcCompact(untilInstant(v, zone))] : [k, v]
		)
	);
}

/**
 * The rule expanded as FLOATING wall clocks (in UTC, no UNTIL): the library skips wall clocks that
 * do not exist in the real zone, but those have to be shifted, not skipped. Callers map each
 * wall clock into the real zone and apply UNTIL to the real instants.
 */
function buildFloating(spec: RuleSpec) {
	const rrule = join(parts(spec.rrule).filter(([k]) => k !== 'UNTIL'));
	return new RRuleTemporal({
		rruleString: `${dtstart({ ...spec, timeZone: 'UTC' })}\nRRULE:${rrule}`
	});
}

function untilOf(spec: RuleSpec): number | null {
	const u = parts(spec.rrule).find(([k]) => k === 'UNTIL');
	return u ? untilInstant(u[1], spec.timeZone).epochMilliseconds : null;
}

/**
 * Validate a rule and return it in canonical form (upper case, no "RRULE:" prefix). Throws a
 * readable error for anything we cannot expand. Only DAILY..YEARLY are supported.
 */
export function normalizeRule(input: string): string {
	let text = input.trim();
	if (/^rrule:/i.test(text)) text = text.slice(6).trim();
	if (!text) throw new Error('Recurrence rule is empty');
	const ps = parts(text);
	const freq = ps.find(([k]) => k === 'FREQ')?.[1];
	if (!freq) throw new Error(`Recurrence rule "${input}" has no FREQ`);
	if (!FREQS.includes(freq)) throw new Error('Recurrence must repeat daily, weekly, monthly or yearly');
	const keys = ps.map(([k]) => k);
	if (keys.includes('COUNT') && keys.includes('UNTIL')) {
		throw new Error('A recurrence rule cannot have both COUNT and UNTIL');
	}
	const rule = join(ps);
	try {
		const probe: RuleSpec = { rrule: rule, startLocal: '2026-01-05T09:00', timeZone: 'UTC' };
		new RRuleTemporal({
			rruleString: `${dtstart(probe)}\nRRULE:${withUtcUntil(probe.rrule, probe.timeZone)}`
		}).between(new Date(0), new Date(Date.UTC(2027, 0, 1)), true);
	} catch (e) {
		throw new Error(`Invalid recurrence rule "${input}": ${(e as Error).message}`);
	}
	return rule;
}

/** The rule as RFC 5545 expects it in an iCal file: UNTIL in UTC. */
export function toRfcRule(spec: RuleSpec): string {
	return withUtcUntil(spec.rrule, spec.timeZone);
}

/**
 * Occurrences whose START lies in [fromMs, toMs) (epoch milliseconds), ordered. Callers that need
 * occurrences overlapping a range should widen `fromMs` by the event duration. Bounded rules are
 * fine; unbounded ones are cut by the range.
 */
export function occurrencesBetween(spec: RuleSpec, fromMs: number, toMs: number): Occurrence[] {
	if (toMs <= fromMs) return [];
	const margin = 2 * 24 * 60 * 60 * 1000; // wall clock vs instant differ by the UTC offset (at most about 14 h)
	const until = untilOf(spec);
	return buildFloating(spec)
		.between(new Date(fromMs - margin), new Date(toMs + margin), true)
		.map((f) => {
			const wall = f.toPlainDateTime();
			return {
				recurrenceId: wall.toString({ smallestUnit: 'minute' }),
				start: wall.toZonedDateTime(spec.timeZone, { disambiguation: 'compatible' })
			};
		})
		.filter((o) => {
			const t = o.start.epochMilliseconds;
			return t >= fromMs && t < toMs && (until === null || t <= until);
		});
}

/** The occurrence with this recurrenceId, or null if the rule does not produce one. */
export function occurrenceAt(spec: RuleSpec, recurrenceId: string): Occurrence | null {
	let wall: Temporal.PlainDateTime;
	try {
		wall = Temporal.PlainDateTime.from(recurrenceId);
	} catch {
		return null;
	}
	const ms = wall.toZonedDateTime(spec.timeZone, { disambiguation: 'compatible' }).epochMilliseconds;
	const id = wall.toString({ smallestUnit: 'minute' });
	// A shifted occurrence (gap) shares its instant with the wall clock after the gap: match the id too.
	return occurrencesBetween(spec, ms, ms + 1).find((o) => o.recurrenceId === id) ?? null;
}

/** Number of occurrences that start before `cutoffLocal` (a wall clock in the rule's zone). */
function countBefore(spec: RuleSpec, cutoffLocal: string): number {
	const cutoff = Temporal.PlainDateTime.from(cutoffLocal).toZonedDateTime(spec.timeZone);
	const first = Temporal.PlainDateTime.from(spec.startLocal).toZonedDateTime(spec.timeZone);
	return occurrencesBetween(spec, first.epochMilliseconds, cutoff.epochMilliseconds).length;
}

/**
 * The same rule cut off so that nothing at or after `cutoffLocal` remains (the head of a split
 * series). COUNT is converted to UNTIL so that the head keeps exactly its occurrences.
 */
export function ruleEndingBefore(spec: RuleSpec, cutoffLocal: string): string {
	const cutoff = Temporal.PlainDateTime.from(cutoffLocal)
		.toZonedDateTime(spec.timeZone)
		.toInstant()
		.subtract({ seconds: 1 });
	const ps = parts(spec.rrule).filter(([k]) => k !== 'COUNT');
	const existing = ps.find(([k]) => k === 'UNTIL');
	if (existing && Temporal.Instant.compare(untilInstant(existing[1], spec.timeZone), cutoff) <= 0) {
		return join(ps);
	}
	return join([...ps.filter(([k]) => k !== 'UNTIL'), ['UNTIL', utcCompact(cutoff)]]);
}

/**
 * The rule for a series that continues from `cutoffLocal` on (the tail of a split): same pattern,
 * and COUNT reduced by the occurrences already used by the head. Returns null if nothing is left.
 */
export function ruleContinuingFrom(spec: RuleSpec, cutoffLocal: string): string | null {
	const count = parts(spec.rrule).find(([k]) => k === 'COUNT');
	if (!count) return spec.rrule;
	const left = Number(count[1]) - countBefore(spec, cutoffLocal);
	if (left <= 0) return null;
	return join(parts(spec.rrule).map(([k, v]): [string, string] => (k === 'COUNT' ? [k, String(left)] : [k, v])));
}
