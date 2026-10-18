import { describe, expect, it } from 'vitest';
import { createTestPlanner } from '#lib/core/testing/harness.js';
import { saveEvent } from './save.js';
import type { EventAgendaItem, Planner } from '#lib/core/index.js';

const evs = (p: Planner, from: string, to: string) =>
	p.agenda(from, to).filter((i): i is EventAgendaItem => i.kind === 'event');

/** What the browser posts for the edit form of a daily 09:00-10:00 Kyiv Event. */
function post(fields: Record<string, string>) {
	const base: Record<string, string> = {
		title: 'Зарядка',
		notes: '',
		location: '',
		timeZone: 'Europe/Kyiv',
		start: '2026-03-27T09:00',
		end: '2026-03-27T10:00',
		recurrence: 'FREQ=DAILY',
		occ: '2026-03-27T09:00',
		scope: 'all'
	};
	const f = new FormData();
	for (const [k, v] of Object.entries({ ...base, ...fields })) if (v !== undefined) f.set(k, v);
	return f;
}

function setup() {
	const t = createTestPlanner();
	const series = t.planner.createEvent('owner', {
		title: 'Зарядка',
		timeZone: 'Europe/Kyiv',
		start: '2026-03-25T09:00',
		recurrence: 'FREQ=DAILY'
	});
	const titles = () =>
		evs(t.planner, '2026-03-26', '2026-03-28').map((i) => `${i.title}@${i.startLocal.slice(5)}`);
	return { ...t, series, titles };
}

describe('saving the Event form', () => {
	it('"only this" changes one occurrence', () => {
		const { planner, series, titles } = setup();
		saveEvent(planner, 'owner', series.id, post({ scope: 'this', title: 'Разовая' }));
		expect(titles()).toEqual(['Зарядка@03-26T09:00', 'Разовая@03-27T09:00', 'Зарядка@03-28T09:00']);
	});

	it('"only this" moved to another time', () => {
		const { planner, series, titles } = setup();
		saveEvent(planner, 'owner', series.id, post({ scope: 'this', start: '2026-03-27T18:00', end: '2026-03-27T19:00' }));
		expect(titles()[1]).toBe('Зарядка@03-27T18:00');
	});

	it('"this and following" splits, and keeps the rule when the editor did not change it', () => {
		const { planner, series, titles } = setup();
		const tail = saveEvent(planner, 'owner', series.id, post({ scope: 'following', title: 'Новая' }));
		expect(tail.id).not.toBe(series.id);
		expect(titles()).toEqual(['Зарядка@03-26T09:00', 'Новая@03-27T09:00', 'Новая@03-28T09:00']);
	});

	it('"all" with an occurrence open moves the whole series by the same shift', () => {
		const { planner, series, titles } = setup();
		saveEvent(planner, 'owner', series.id, post({ start: '2026-03-27T10:30', end: '2026-03-27T11:30' }));
		expect(titles()).toEqual(['Зарядка@03-26T10:30', 'Зарядка@03-27T10:30', 'Зарядка@03-28T10:30']);
		expect(planner.getEvent(series.id).startLocal).toBe('2026-03-25T10:30');
	});

	it('"all" with an untouched form changes nothing but what was edited', () => {
		const { planner, series } = setup();
		planner.cancelOccurrence('owner', series.id, '2026-03-26T09:00');
		saveEvent(planner, 'owner', series.id, post({ title: 'Другое' }));
		const e = planner.getEvent(series.id);
		expect(e.title).toBe('Другое');
		expect(e.startLocal).toBe('2026-03-25T09:00');
		expect(Object.keys(e.overrides)).toEqual(['2026-03-26T09:00']);
	});

	it('an empty rule makes the series one-off', () => {
		const { planner, series } = setup();
		saveEvent(planner, 'owner', series.id, post({ recurrence: '' }));
		expect(planner.getEvent(series.id).recurrence).toBeNull();
	});

	it('a plain one-off Event saves as before', () => {
		const { planner } = createTestPlanner();
		const e = planner.createEvent('owner', { title: 'x', start: '2026-03-27T09:00' });
		saveEvent(planner, 'owner', e.id, post({ title: 'y', occ: '', recurrence: '', timeZone: 'Europe/Istanbul' }));
		expect(planner.getEvent(e.id).title).toBe('y');
	});
});
