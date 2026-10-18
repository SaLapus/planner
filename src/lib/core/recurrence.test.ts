import { describe, expect, it } from 'vitest';
import { normalizeRule, occurrenceAt, occurrencesBetween, ruleEndingBefore, type RuleSpec } from './recurrence.js';

const ms = (iso: string) => Temporal.Instant.from(iso).epochMilliseconds;
const ids = (spec: RuleSpec, from: string, to: string) =>
	occurrencesBetween(spec, ms(from), ms(to)).map((o) => o.recurrenceId);

const kyiv = (rrule: string, startLocal = '2026-03-25T09:00'): RuleSpec => ({
	rrule,
	startLocal,
	timeZone: 'Europe/Kyiv'
});

describe('recurrence: patterns', () => {
	it('daily with COUNT', () => {
		expect(ids(kyiv('FREQ=DAILY;COUNT=3'), '2026-01-01T00:00Z', '2027-01-01T00:00Z')).toEqual([
			'2026-03-25T09:00',
			'2026-03-26T09:00',
			'2026-03-27T09:00'
		]);
	});

	it('every 2 days', () => {
		expect(ids(kyiv('FREQ=DAILY;INTERVAL=2;COUNT=3'), '2026-01-01T00:00Z', '2027-01-01T00:00Z')).toEqual([
			'2026-03-25T09:00',
			'2026-03-27T09:00',
			'2026-03-29T09:00'
		]);
	});

	it('weekly on chosen weekdays, week starting Monday', () => {
		// 2026-03-25 is a Wednesday
		expect(ids(kyiv('FREQ=WEEKLY;BYDAY=MO,WE;COUNT=4'), '2026-01-01T00:00Z', '2027-01-01T00:00Z')).toEqual([
			'2026-03-25T09:00',
			'2026-03-30T09:00',
			'2026-04-01T09:00',
			'2026-04-06T09:00'
		]);
	});

	it('monthly on the day of month; short months are skipped', () => {
		expect(
			ids(kyiv('FREQ=MONTHLY;COUNT=3', '2026-01-31T09:00'), '2026-01-01T00:00Z', '2027-01-01T00:00Z')
		).toEqual(['2026-01-31T09:00', '2026-03-31T09:00', '2026-05-31T09:00']);
	});

	it('yearly', () => {
		expect(ids(kyiv('FREQ=YEARLY;COUNT=2', '2026-02-10T09:00'), '2026-01-01T00:00Z', '2030-01-01T00:00Z')).toEqual([
			'2026-02-10T09:00',
			'2027-02-10T09:00'
		]);
	});

	it('UNTIL date (inclusive, given as a local date)', () => {
		expect(ids(kyiv('FREQ=DAILY;UNTIL=2026-03-27'), '2026-01-01T00:00Z', '2027-01-01T00:00Z')).toEqual([
			'2026-03-25T09:00',
			'2026-03-26T09:00',
			'2026-03-27T09:00'
		]);
	});

	it('returns only the requested range, including month/year boundaries', () => {
		const spec = kyiv('FREQ=WEEKLY;BYDAY=TH', '2026-12-03T10:00');
		expect(ids(spec, '2026-12-31T00:00Z', '2027-01-08T00:00Z')).toEqual([
			'2026-12-31T10:00',
			'2027-01-07T10:00'
		]);
		const monthly = kyiv('FREQ=MONTHLY;BYMONTHDAY=31', '2026-01-31T10:00');
		expect(ids(monthly, '2026-03-31T00:00Z', '2026-04-01T00:00Z')).toEqual(['2026-03-31T10:00']);
		expect(ids(monthly, '2026-04-01T00:00Z', '2026-05-01T00:00Z')).toEqual([]);
	});

	it('rejects garbage and sub-daily rules', () => {
		expect(() => normalizeRule('hello')).toThrow(/recurrence/i);
		expect(() => normalizeRule('FREQ=HOURLY')).toThrow(/daily/i);
		expect(() => normalizeRule('FREQ=DAILY;COUNT=2;UNTIL=2026-05-01')).toThrow(/COUNT and UNTIL/);
	});

	it('accepts an RRULE: prefix and normalises case/space', () => {
		expect(normalizeRule(' rrule:freq=weekly;byday=mo ')).toBe('FREQ=WEEKLY;BYDAY=MO');
	});
});

describe('recurrence: time zones', () => {
	it('keeps the wall clock across the DST switch (Kyiv)', () => {
		const occ = occurrencesBetween(kyiv('FREQ=DAILY;COUNT=7'), ms('2026-03-01T00:00Z'), ms('2026-04-30T00:00Z'));
		const utc = occ.map((o) => o.start.toInstant().toString());
		expect(utc[0]).toBe('2026-03-25T07:00:00Z'); // +02
		expect(utc[3]).toBe('2026-03-28T07:00:00Z');
		expect(utc[4]).toBe('2026-03-29T06:00:00Z'); // +03 after the switch, still 09:00 local
	});

	it('Istanbul has no DST: the instant never moves', () => {
		const spec: RuleSpec = { rrule: 'FREQ=DAILY;COUNT=7', startLocal: '2026-03-25T09:00', timeZone: 'Europe/Istanbul' };
		const utc = occurrencesBetween(spec, ms('2026-03-01T00:00Z'), ms('2026-04-30T00:00Z')).map((o) =>
			o.start.toInstant().toString().slice(11)
		);
		expect(new Set(utc)).toEqual(new Set(['06:00:00Z']));
	});

	it('an occurrence inside the spring-forward gap is shifted forward (RFC 5545 3.3.10) and counts toward COUNT', () => {
		const spec = kyiv('FREQ=DAILY;COUNT=3', '2026-03-28T03:30');
		const occ = occurrencesBetween(spec, ms('2026-03-01T00:00Z'), ms('2026-04-30T00:00Z'));
		// recurrenceId stays the original wall clock; the start uses the offset before the gap (+02): 01:30Z = 04:30 +03.
		expect(occ.map((o) => o.recurrenceId)).toEqual(['2026-03-28T03:30', '2026-03-29T03:30', '2026-03-30T03:30']);
		expect(occ.map((o) => o.start.toInstant().toString())).toEqual([
			'2026-03-28T01:30:00Z',
			'2026-03-29T01:30:00Z',
			'2026-03-30T00:30:00Z'
		]);
	});

	it('the shifted occurrence can be addressed by its original wall clock', () => {
		const spec = kyiv('FREQ=DAILY', '2026-03-28T03:30');
		expect(occurrenceAt(spec, '2026-03-29T03:30')?.start.toInstant().toString()).toBe('2026-03-29T01:30:00Z');
		expect(occurrenceAt(spec, '2026-03-29T04:30')).toBeNull();
	});

	it('UNTIL still ends the series when the last occurrence is shifted', () => {
		const spec = kyiv('FREQ=DAILY;UNTIL=2026-03-29', '2026-03-28T03:30');
		expect(ids(spec, '2026-03-01T00:00Z', '2026-04-30T00:00Z')).toEqual(['2026-03-28T03:30', '2026-03-29T03:30']);
	});
});

describe('recurrence: ruleEndingBefore (for series split)', () => {
	it('turns an open rule into UNTIL the day before the cutoff', () => {
		const spec = kyiv('FREQ=DAILY');
		const rule = ruleEndingBefore(spec, '2026-03-28T09:00');
		expect(ids({ ...spec, rrule: rule }, '2026-01-01T00:00Z', '2027-01-01T00:00Z')).toEqual([
			'2026-03-25T09:00',
			'2026-03-26T09:00',
			'2026-03-27T09:00'
		]);
	});

	it('converts COUNT to UNTIL, keeping the same occurrences', () => {
		const spec = kyiv('FREQ=DAILY;COUNT=10');
		const rule = ruleEndingBefore(spec, '2026-03-28T09:00');
		expect(rule).not.toMatch(/COUNT/);
		expect(ids({ ...spec, rrule: rule }, '2026-01-01T00:00Z', '2027-01-01T00:00Z')).toHaveLength(3);
	});
});
