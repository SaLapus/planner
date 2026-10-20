import { describe, expect, it, vi } from 'vitest';

let today = '2026-03-11';
vi.mock('#lib/server/planner.js', () => ({ getPlanner: () => ({ today: () => today }) }));

import { GET } from './+server.js';

describe('Schedule root', () => {
	it('redirects temporarily, uncached, to the Week of today in the Home time zone', async () => {
		const res = await GET({} as never);
		expect(res.status).toBe(307);
		expect(res.headers.get('location')).toBe('/events/week/2026-03-11');
		expect(res.headers.get('cache-control')).toBe('no-store');
	});

	it('follows the date after midnight', async () => {
		today = '2026-03-12';
		expect((await GET({} as never)).headers.get('location')).toBe('/events/week/2026-03-12');
	});
});
