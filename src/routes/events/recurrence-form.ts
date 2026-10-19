// The recurrence editor's logic, without any Svelte: turns the form fields into an RFC 5545 RRULE
// string and back, and describes a rule in Russian. Rules the editor cannot express (for example
// "first Monday of the month") are kept untouched in `custom`.

import { plural, ruleParts } from '../rrule-form.js';

export type Freq = 'NONE' | 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';

export interface RecurrenceForm {
	freq: Freq;
	interval: number;
	/** Weekday codes for weekly rules: MO TU WE TH FR SA SU. */
	days: string[];
	end: 'never' | 'until' | 'count';
	/** "YYYY-MM-DD", inclusive, when end is 'until'. */
	until: string;
	count: number;
	/** A rule the editor cannot express; when set it wins over everything else. */
	custom: string;
}

export const WEEKDAYS = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'] as const;
export const WEEKDAY_LABELS: Record<string, string> = {
	MO: 'пн',
	TU: 'вт',
	WE: 'ср',
	TH: 'чт',
	FR: 'пт',
	SA: 'сб',
	SU: 'вс'
};

const weekdayOf = (date: string) => WEEKDAYS[Temporal.PlainDate.from(date).dayOfWeek - 1];

/** The rule for the form, or null for "does not repeat". `startDate` ("YYYY-MM-DD") picks the default weekday. */
export function buildRule(f: RecurrenceForm, startDate: string): string | null {
	if (f.custom) return f.custom;
	if (f.freq === 'NONE') return null;
	const parts = [`FREQ=${f.freq}`];
	if (f.interval > 1) parts.push(`INTERVAL=${Math.floor(f.interval)}`);
	if (f.freq === 'WEEKLY') {
		const days = f.days.length ? WEEKDAYS.filter((d) => f.days.includes(d)) : [weekdayOf(startDate)];
		parts.push(`BYDAY=${days.join(',')}`);
	}
	if (f.end === 'count') parts.push(`COUNT=${Math.max(1, Math.floor(f.count))}`);
	if (f.end === 'until' && f.until) parts.push(`UNTIL=${f.until}`);
	return parts.join(';');
}

const empty = (): RecurrenceForm => ({
	freq: 'NONE',
	interval: 1,
	days: [],
	end: 'never',
	until: '',
	count: 10,
	custom: ''
});

/** `timeZone` turns an RFC UTC UNTIL ("20260327T205959Z") into the local date shown in the form. */
export function parseRule(rule: string | null, timeZone: string): RecurrenceForm {
	const f = empty();
	if (!rule) return f;
	const custom = () => ({ ...empty(), custom: rule });
	const map = ruleParts(rule);
	const freq = map.get('FREQ');
	if (freq !== 'DAILY' && freq !== 'WEEKLY' && freq !== 'MONTHLY' && freq !== 'YEARLY') return custom();
	for (const k of map.keys()) {
		if (!['FREQ', 'INTERVAL', 'BYDAY', 'COUNT', 'UNTIL'].includes(k)) return custom();
	}
	f.freq = freq;
	f.interval = Number(map.get('INTERVAL') ?? 1);
	const byday = map.get('BYDAY');
	if (byday) {
		const days = byday.split(',');
		if (freq !== 'WEEKLY' || days.some((d) => !(WEEKDAYS as readonly string[]).includes(d))) return custom();
		f.days = days;
	}
	if (map.has('COUNT')) {
		f.end = 'count';
		f.count = Number(map.get('COUNT'));
	}
	const until = map.get('UNTIL');
	if (until) {
		f.end = 'until';
		const utc = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(until);
		f.until = utc
			? Temporal.Instant.from(`${utc[1]}-${utc[2]}-${utc[3]}T${utc[4]}:${utc[5]}:${utc[6]}Z`)
					.toZonedDateTimeISO(timeZone)
					.toPlainDate()
					.toString()
			: until.length === 8
				? `${until.slice(0, 4)}-${until.slice(4, 6)}-${until.slice(6)}`
				: until;
	}
	return f;
}

const times = (n: number) => `${n} ${plural(n, ['раз', 'раза', 'раз'])}`;

/** A short Russian description of a rule, for lists: "Каждую неделю: пн, ср, 5 раз". */
export function describeRule(rule: string, timeZone = 'UTC'): string {
	const f = parseRule(rule, timeZone);
	if (f.custom) return 'Особое повторение';
	const unit = {
		DAILY: ['Каждый день', 'дн.'],
		WEEKLY: ['Каждую неделю', 'нед.'],
		MONTHLY: ['Каждый месяц', 'мес.'],
		YEARLY: ['Каждый год', 'г.'],
		NONE: ['', '']
	}[f.freq];
	let text = f.interval > 1 ? `Каждые ${f.interval} ${unit[1]}` : unit[0];
	if (f.freq === 'WEEKLY' && f.days.length) text += `: ${f.days.map((d) => WEEKDAY_LABELS[d]).join(', ')}`;
	if (f.end === 'count') text += `, ${times(f.count)}`;
	if (f.end === 'until') text += `, до ${f.until.split('-').reverse().join('.')}`;
	return text;
}
