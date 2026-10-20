import { describe, expect, it } from 'vitest';
import { scheduleItems } from './schedule-nav.js';

const TODAY = '2026-03-11';

function current(pathname: string) {
	return scheduleItems(TODAY, pathname).filter((i) => i.current).map((i) => i.label);
}

describe('Schedule second row', () => {
	it('lists Неделя, День, Список, Лента in order, pointing at today', () => {
		expect(scheduleItems(TODAY, '/events/list').map((i) => [i.label, i.href])).toEqual([
			['Неделя', '/events/week/2026-03-11'],
			['День', '/events/day/2026-03-11'],
			['Список', '/events/list'],
			['Лента', '/calendar']
		]);
	});

	it('highlights the view the path belongs to', () => {
		expect(current('/events/week/2026-03-02')).toEqual(['Неделя']);
		expect(current('/events/day/2026-03-02')).toEqual(['День']);
		expect(current('/events/list')).toEqual(['Список']);
		expect(current('/calendar')).toEqual(['Лента']);
	});

	it('highlights nothing on other Schedule pages', () => {
		expect(current('/events/new')).toEqual([]);
		expect(current('/events/5')).toEqual([]);
	});
});
