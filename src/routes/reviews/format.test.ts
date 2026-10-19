import { describe, expect, it } from 'vitest';
import { periodTitle } from './format.js';

describe('periodTitle', () => {
	it('names a week by its Monday..Sunday dates', () => {
		expect(periodTitle('week', '2026-01-05')).toBe('Неделя 5–11 января 2026');
	});
	it('shows both months when a week crosses a month boundary', () => {
		expect(periodTitle('week', '2026-01-26')).toBe('Неделя 26 января–1 февраля 2026');
	});
	it('names a month with a capital letter and the year', () => {
		expect(periodTitle('month', '2026-02-01')).toBe('Февраль 2026');
	});
});
