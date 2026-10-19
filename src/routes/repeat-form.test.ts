import { describe, expect, it } from 'vitest';
import { repeatFields, repeatLabel, repeatOf } from './repeat-form.js';

const form = (fields: Record<string, string>) => {
	const f = new FormData();
	for (const [k, v] of Object.entries(fields)) f.set(k, v);
	return f;
};

describe('repeat form', () => {
	it('reads the form into a repetition', () => {
		expect(repeatOf(form({ repeatKind: 'none' }))).toBeNull();
		expect(repeatOf(form({ repeatKind: 'fixed', repeatEvery: '1', repeatUnit: 'week' }))).toEqual({
			type: 'fixed',
			rrule: 'FREQ=WEEKLY'
		});
		expect(repeatOf(form({ repeatKind: 'fixed', repeatEvery: '2', repeatUnit: 'month' }))).toEqual({
			type: 'fixed',
			rrule: 'FREQ=MONTHLY;INTERVAL=2'
		});
		expect(repeatOf(form({ repeatKind: 'after', repeatEvery: '3', repeatUnit: 'day' }))).toEqual({
			type: 'after',
			every: 3,
			unit: 'day'
		});
		expect(repeatOf(form({ repeatKind: 'custom' }))).toBeUndefined();
	});

	it('shows a repetition back in the form; complex rules are custom', () => {
		expect(repeatFields({ type: 'fixed', rrule: 'FREQ=MONTHLY;INTERVAL=2' })).toEqual({
			kind: 'fixed',
			every: 2,
			unit: 'month'
		});
		expect(repeatFields({ type: 'fixed', rrule: 'FREQ=WEEKLY;BYDAY=MO,TH' }).kind).toBe('custom');
		expect(repeatFields(null).kind).toBe('none');
	});

	it('labels in Russian with correct plurals', () => {
		expect(repeatLabel({ type: 'fixed', rrule: 'FREQ=WEEKLY' })).toBe('каждую неделю');
		expect(repeatLabel({ type: 'fixed', rrule: 'FREQ=WEEKLY;INTERVAL=2' })).toBe('каждые 2 недели');
		expect(repeatLabel({ type: 'after', every: 3, unit: 'day' })).toBe('через 3 дня после выполнения');
		expect(repeatLabel({ type: 'after', every: 5, unit: 'day' })).toBe('через 5 дней после выполнения');
		expect(repeatLabel({ type: 'after', every: 21, unit: 'day' })).toBe('через 21 день после выполнения');
	});
});
