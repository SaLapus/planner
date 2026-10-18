import { describe, expect, it } from 'vitest';
import { createTestPlanner } from '#lib/core/testing/harness.js';
import { parseFeed } from '#lib/core/testing/ics.js';
import { feedResponse, isFeedPath } from './feed.js';

describe('serving the Calendar feed', () => {
	function setup() {
		const { planner } = createTestPlanner();
		planner.createEvent('owner', { title: 'Приём у врача', start: '2026-03-30T10:00', timeZone: 'Europe/Kyiv' });
		return planner;
	}

	it('serves iCalendar at the secret path', async () => {
		const planner = setup();
		const res = feedResponse(planner, `${planner.feedSecret()}.ics`);
		expect(res.status).toBe(200);
		expect(res.headers.get('content-type')).toBe('text/calendar; charset=utf-8');
		expect(res.headers.get('cache-control')).toContain('private');
		expect(parseFeed(await res.text()).events.map((e) => e.summary)).toEqual(['Приём у врача']);
	});

	it('answers 404 (not 401 or 403) to a wrong secret, a missing .ics and an empty name', () => {
		const planner = setup();
		const secret = planner.feedSecret();
		for (const name of ['wrong.ics', '.ics', '', secret, `${secret}.ical`, `${secret}.ics.ics`]) {
			expect(feedResponse(planner, name).status, name).toBe(404);
		}
	});

	it('answers 404 to the old secret after regeneration, and serves the new one', () => {
		const planner = setup();
		const old = planner.feedSecret();
		const fresh = planner.regenerateFeedSecret('owner');
		expect(feedResponse(planner, `${old}.ics`).status).toBe(404);
		expect(feedResponse(planner, `${fresh}.ics`).status).toBe(200);
	});

	it('knows which paths are the public feed (no login) and which are not', () => {
		expect(isFeedPath('/feed/abc.ics')).toBe(true);
		expect(isFeedPath('/feed/')).toBe(true);
		expect(isFeedPath('/feeds')).toBe(false);
		expect(isFeedPath('/feedback/x')).toBe(false);
		expect(isFeedPath('/')).toBe(false);
	});
});
