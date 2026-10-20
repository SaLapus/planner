import { describe, expect, it } from 'vitest';
import { NAV_MAIN, NAV_SECONDARY, currentSection, showsNav } from './nav.js';

describe('current section', () => {
	it('is worked out from the first path segment', () => {
		expect(currentSection('/goals')).toBe('/goals');
		expect(currentSection('/stats')).toBe('/stats');
		expect(currentSection('/trash')).toBe('/trash');
	});

	it('treats the root as Задачи', () => {
		expect(currentSection('/')).toBe('/');
	});

	it('counts the calendar feed and every Schedule page as Расписание', () => {
		expect(currentSection('/calendar')).toBe('/events');
		expect(currentSection('/events')).toBe('/events');
		expect(currentSection('/events/week/2026-01-12')).toBe('/events');
		expect(currentSection('/events/new')).toBe('/events');
	});

	it('highlights the parent section on detail pages', () => {
		expect(currentSection('/goals/3')).toBe('/goals');
		expect(currentSection('/habits/7')).toBe('/habits');
		expect(currentSection('/reviews/2')).toBe('/reviews');
		expect(currentSection('/events/5')).toBe('/events');
	});

	it('ignores a trailing slash', () => {
		expect(currentSection('/goals/')).toBe('/goals');
	});

	it('is null for paths that are in no section', () => {
		expect(currentSection('/nowhere')).toBeNull();
	});
});

describe('bar visibility', () => {
	it('is hidden on /auth/* pages only', () => {
		expect(showsNav('/auth/denied')).toBe(false);
		expect(showsNav('/auth/logged-out')).toBe(false);
		expect(showsNav('/')).toBe(true);
		expect(showsNav('/goals/3')).toBe(true);
	});
});

describe('item list', () => {
	it('has the main sections in order, then the secondary group', () => {
		expect(NAV_MAIN.map((i) => i.label)).toEqual(['Задачи', 'Расписание', 'Привычки', 'Цели', 'Обзоры', 'Статистика']);
		expect(NAV_SECONDARY.map((i) => i.label)).toEqual(['Проекты', 'Корзина', 'Журнал']);
	});
});
