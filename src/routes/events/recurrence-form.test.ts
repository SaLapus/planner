import { describe, expect, it } from 'vitest';
import { buildRule, parseRule, describeRule, type RecurrenceForm } from './recurrence-form.js';

const base: RecurrenceForm = {
	freq: 'DAILY',
	interval: 1,
	days: [],
	end: 'never',
	until: '',
	count: 10,
	custom: ''
};

describe('recurrence editor: form <-> RRULE', () => {
	it('no repeat gives no rule', () => {
		expect(buildRule({ ...base, freq: 'NONE' }, '2026-03-25')).toBeNull();
	});

	it('builds each pattern', () => {
		expect(buildRule(base, '2026-03-25')).toBe('FREQ=DAILY');
		expect(buildRule({ ...base, interval: 3 }, '2026-03-25')).toBe('FREQ=DAILY;INTERVAL=3');
		expect(buildRule({ ...base, freq: 'WEEKLY', days: ['MO', 'WE'] }, '2026-03-25')).toBe('FREQ=WEEKLY;BYDAY=MO,WE');
		expect(buildRule({ ...base, freq: 'MONTHLY', interval: 2 }, '2026-03-25')).toBe('FREQ=MONTHLY;INTERVAL=2');
		expect(buildRule({ ...base, freq: 'YEARLY' }, '2026-03-25')).toBe('FREQ=YEARLY');
	});

	it('weekly with no weekday ticked repeats on the start date weekday', () => {
		expect(buildRule({ ...base, freq: 'WEEKLY' }, '2026-03-25')).toBe('FREQ=WEEKLY;BYDAY=WE');
	});

	it('ends after N times or on a date', () => {
		expect(buildRule({ ...base, end: 'count', count: 5 }, '2026-03-25')).toBe('FREQ=DAILY;COUNT=5');
		expect(buildRule({ ...base, end: 'until', until: '2026-06-30' }, '2026-03-25')).toBe('FREQ=DAILY;UNTIL=2026-06-30');
	});

	it('keeps a custom rule the editor cannot express', () => {
		expect(buildRule({ ...base, custom: 'FREQ=MONTHLY;BYDAY=1MO' }, '2026-03-25')).toBe('FREQ=MONTHLY;BYDAY=1MO');
	});

	it('reads rules back (round trip)', () => {
		for (const rule of ['FREQ=DAILY', 'FREQ=DAILY;INTERVAL=3;COUNT=5', 'FREQ=WEEKLY;BYDAY=MO,WE', 'FREQ=MONTHLY;UNTIL=2026-06-30', 'FREQ=YEARLY']) {
			expect(buildRule(parseRule(rule, 'Europe/Kyiv'), '2026-03-25')).toBe(rule);
		}
		expect(parseRule(null, 'Europe/Kyiv').freq).toBe('NONE');
	});

	it('shows an RFC UTC UNTIL (made by a series split) as a local date', () => {
		// 2026-03-27 20:59:59 UTC is 23:59:59 on 27 March in Kyiv-summer? Kyiv is +2 on 27 March, so 22:59:59 local.
		expect(parseRule('FREQ=DAILY;UNTIL=20260327T205959Z', 'Europe/Kyiv').until).toBe('2026-03-27');
	});

	it('unknown parts become a custom rule', () => {
		const f = parseRule('FREQ=MONTHLY;BYDAY=1MO', 'Europe/Kyiv');
		expect(f.custom).toBe('FREQ=MONTHLY;BYDAY=1MO');
	});

	it('describes a rule in Russian', () => {
		expect(describeRule('FREQ=DAILY')).toBe('Каждый день');
		expect(describeRule('FREQ=WEEKLY;BYDAY=MO,WE')).toBe('Каждую неделю: пн, ср');
		expect(describeRule('FREQ=MONTHLY;INTERVAL=2;COUNT=3')).toBe('Каждые 2 мес., 3 раза');
	});
});
