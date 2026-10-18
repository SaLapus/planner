import { describe, expect, it } from 'vitest';
import { createPlanner } from './index.js';
import { createTestPlanner } from './testing/harness.js';

describe('calendar feed secret', () => {
	it('exists from the start, is URL-safe and long, and stays the same between calls', () => {
		const { planner } = createTestPlanner();
		const secret = planner.feedSecret();
		expect(secret).toMatch(/^[A-Za-z0-9_-]{32,}$/);
		expect(planner.feedSecret()).toBe(secret);
	});

	it('is recognised only when exactly right', () => {
		const { planner } = createTestPlanner();
		const secret = planner.feedSecret();
		expect(planner.isFeedSecret(secret)).toBe(true);
		expect(planner.isFeedSecret(secret.slice(0, -1))).toBe(false);
		expect(planner.isFeedSecret(secret + 'x')).toBe(false);
		expect(planner.isFeedSecret(secret.slice(0, -1) + (secret.endsWith('a') ? 'b' : 'a'))).toBe(false);
		expect(planner.isFeedSecret('')).toBe(false);
	});

	it('regenerating revokes the old secret and logs who did it, without writing the secret into the log', () => {
		const { planner } = createTestPlanner();
		const old = planner.feedSecret();
		const fresh = planner.regenerateFeedSecret('owner');
		expect(fresh).not.toBe(old);
		expect(planner.feedSecret()).toBe(fresh);
		expect(planner.isFeedSecret(old)).toBe(false);
		expect(planner.isFeedSecret(fresh)).toBe(true);

		const entries = planner.changeLog();
		expect(entries).toHaveLength(1);
		expect(entries[0]).toMatchObject({ actor: 'owner', action: 'feed.regenerate', entityType: 'feed' });
		expect(JSON.stringify(entries)).not.toContain(old);
		expect(JSON.stringify(entries)).not.toContain(fresh);
	});

	it('is stored in the database, so it survives a restart', () => {
		const { planner, db, clock } = createTestPlanner();
		const secret = planner.regenerateFeedSecret('owner');
		// A second Planner on the same database is what a server restart looks like.
		const restarted = createPlanner({ db, clock, homeTimeZone: 'Europe/Istanbul' });
		expect(restarted.feedSecret()).toBe(secret);
	});
});
