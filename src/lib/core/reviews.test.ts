import { describe, expect, it } from 'vitest';
import { createTestPlanner } from './testing/harness.js';

describe('Reviews', () => {
	it('creates a review for the period containing a date and edits draft and reflection separately', () => {
		const { planner, clock } = createTestPlanner({ now: '2026-01-11T18:00:00Z' });
		const review = planner.createReview('claude', { period: 'week', draft: '# Неделя\n\nСделано 3 задачи' });
		expect(review).toMatchObject({
			periodType: 'week',
			periodStart: '2026-01-05',
			draft: '# Неделя\n\nСделано 3 задачи',
			reflection: ''
		});

		clock.advance(60_000);
		const edited = planner.updateReview('owner', review.id, { reflection: 'Хорошая неделя' });
		expect(edited.draft).toBe(review.draft);
		expect(edited.reflection).toBe('Хорошая неделя');
		expect(edited.updatedAt > review.updatedAt).toBe(true);
		expect(planner.getReview(review.id)).toEqual(edited);
		expect(planner.changeLog().map((e) => [e.actor, e.action])).toEqual([
			['claude', 'review.create'],
			['owner', 'review.update']
		]);
	});

	it('allows one review per period: a second is refused and names the existing one', () => {
		const { planner } = createTestPlanner();
		const first = planner.createReview('claude', { period: 'week', date: '2026-01-07' });
		expect(() => planner.createReview('owner', { period: 'week', date: '2026-01-09' })).toThrow(
			new RegExp(`already exists.*#?${first.id}`)
		);
		expect(planner.createReview('owner', { period: 'month', date: '2026-01-09' }).periodStart).toBe('2026-01-01');
		expect(planner.changeLog()).toHaveLength(2); // the refused one logged nothing
	});

	it('lists past reviews newest period first, optionally by type', () => {
		const { planner } = createTestPlanner();
		planner.createReview('owner', { period: 'week', date: '2026-01-07' });
		planner.createReview('owner', { period: 'week', date: '2026-01-14' });
		planner.createReview('owner', { period: 'month', date: '2026-01-14' });
		expect(planner.listReviews().map((r) => [r.periodType, r.periodStart])).toEqual([
			['week', '2026-01-12'],
			['week', '2026-01-05'],
			['month', '2026-01-01']
		]);
		expect(planner.listReviews({ period: 'month' })).toHaveLength(1);
	});

	it('reviewData tells whether a review already exists for the period', () => {
		const { planner } = createTestPlanner({ now: '2026-01-11T18:00:00Z' });
		expect(planner.reviewData({ period: 'week' }).review).toBeNull();
		const review = planner.createReview('claude', { period: 'week', draft: 'x' });
		expect(planner.reviewData({ period: 'week' }).review).toEqual(review);
		expect(planner.reviewData({ period: 'week', date: '2026-01-14' }).review).toBeNull();
	});

	it('rejects bad input and unknown ids', () => {
		const { planner } = createTestPlanner();
		expect(() => planner.createReview('owner', { period: 'year' as never })).toThrow(/week.*month/);
		expect(() => planner.createReview('owner', { period: 'week', date: 'tomorrow' })).toThrow(/Invalid date/);
		expect(() => planner.updateReview('owner', 99, { draft: 'x' })).toThrow(/Review 99 not found/);
	});

	it('is trashable, restorable and undoable through the generic safety net', () => {
		const { planner } = createTestPlanner();
		const review = planner.createReview('owner', { period: 'week', draft: 'a', reflection: 'b' });

		planner.deleteItem('owner', 'review', review.id);
		expect(planner.listReviews()).toEqual([]);
		expect(planner.listTrash().map((t) => t.entityType)).toEqual(['review']);
		planner.restoreItem('owner', 'review', review.id);
		expect(planner.getReview(review.id)).toEqual(review);

		const edited = planner.updateReview('owner', review.id, { draft: 'changed' });
		const change = planner.changeLog().find((e) => e.action === 'review.update')!;
		planner.undoChange('owner', change.id);
		expect(planner.getReview(review.id)).toEqual(review);
		expect(edited.draft).toBe('changed');
	});

	it('refuses to restore a trashed review when its period got a new review meanwhile', () => {
		const { planner } = createTestPlanner();
		const old = planner.createReview('owner', { period: 'week', date: '2026-01-07' });
		planner.deleteItem('owner', 'review', old.id);
		planner.createReview('owner', { period: 'week', date: '2026-01-07' });
		expect(() => planner.restoreItem('owner', 'review', old.id)).toThrow(/already/);
	});
});
