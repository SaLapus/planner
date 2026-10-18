import { describe, expect, it } from 'vitest';
import { createTestConnector, toolJson } from '../testing/harness.js';

describe('Review tools over MCP', () => {
	it('fetches review data for the week and saves a draft, then updates it, all as actor claude', async () => {
		const t = createTestConnector();
		const claude = await t.connectClaude();
		const call = async <T>(name: string, args: Record<string, unknown>) =>
			toolJson<T>(await claude.callTool({ name, arguments: args }));

		t.clock.set('2026-01-11T15:00:00Z'); // Sunday evening, Home zone
		const task = await call<{ id: number }>('create_task', { title: 'сделать отчёт', due: '2026-01-09' });
		const done = await call<{ id: number }>('create_task', { title: 'готово' });
		await call('complete_task', { id: done.id });
		const habit = await call<{ id: number }>('create_habit', {
			title: 'Зал',
			schedule: { type: 'per_week', count: 1 }
		});
		await call('add_checkin', { habitId: habit.id, date: '2026-01-07' });

		const data = await call<{
			period: { type: string; start: string; end: string };
			tasks: { done: { id: number }[]; slipped: { id: number }[] };
			habits: { hitRate: number | null }[];
			review: unknown;
		}>('get_review_data', { period: 'week' });
		expect(data.period).toEqual({ type: 'week', start: '2026-01-05', end: '2026-01-11' });
		expect(data.tasks.done.map((x) => x.id)).toEqual([done.id]);
		expect(data.tasks.slipped.map((x) => x.id)).toEqual([task.id]);
		expect(data.habits[0].hitRate).toBe(null); // the week is not over yet (today is Sunday)
		expect(data.review).toBeNull();

		const saved = await call<{ id: number; periodStart: string }>('create_review', {
			period: 'week',
			draft: '# Неделя\n\nСделано: 1, сорвалось: 1'
		});
		expect(saved.periodStart).toBe('2026-01-05');

		const again = await claude.callTool({ name: 'create_review', arguments: { period: 'week', draft: 'x' } });
		expect(again.isError).toBe(true);

		await call('update_review', { id: saved.id, draft: 'новый черновик' });
		const fetched = await call<{ draft: string; reflection: string }>('get_review', { id: saved.id });
		expect(fetched).toMatchObject({ draft: 'новый черновик', reflection: '' });
		const list = await call<{ id: number }[]>('list_reviews', { period: 'week' });
		expect(list.map((r) => r.id)).toEqual([saved.id]);
		expect((await call<{ review: { id: number } }>('get_review_data', { period: 'week' })).review.id).toBe(saved.id);

		const reviewChanges = t.planner.changeLog().filter((e) => e.entityType === 'review');
		expect(reviewChanges.map((e) => [e.actor, e.action])).toEqual([
			['claude', 'review.create'],
			['claude', 'review.update']
		]);
	});
});
