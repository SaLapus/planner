import { describe, expect, it } from 'vitest';
import { plural, ruleParts, simpleRule } from './rrule-form.js';

describe('rrule-form (shared by the Task and Event editors)', () => {
	it('picks Russian plural forms', () => {
		const days: [string, string, string] = ['день', 'дня', 'дней'];
		expect([1, 2, 5, 11, 12, 21, 22, 25].map((n) => plural(n, days))).toEqual([
			'день', 'дня', 'дней', 'дней', 'дней', 'день', 'дня', 'дней'
		]);
	});

	it('reads only plain FREQ[;INTERVAL] rules as simple', () => {
		expect(simpleRule('FREQ=WEEKLY')).toEqual({ freq: 'WEEKLY', interval: 1 });
		expect(simpleRule('FREQ=MONTHLY;INTERVAL=3')).toEqual({ freq: 'MONTHLY', interval: 3 });
		expect(simpleRule('FREQ=WEEKLY;BYDAY=MO')).toBeNull();
		expect(ruleParts('FREQ=WEEKLY;BYDAY=MO').get('BYDAY')).toBe('MO');
	});
});
