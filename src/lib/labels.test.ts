import { describe, expect, it } from 'vitest';
import { actionName } from './labels.js';
import { createTestPlanner } from './core/testing/harness.js';

describe('Change log labels', () => {
	it('every action the core writes has a Russian label (no raw codes)', () => {
		const { planner } = createTestPlanner();
		planner.regenerateFeedSecret('owner');
		const series = planner.createEvent('owner', { title: 'x', start: '2026-03-25T09:00', recurrence: 'FREQ=DAILY' });
		planner.cancelOccurrence('owner', series.id, '2026-03-26T09:00');
		planner.updateOccurrence('owner', series.id, '2026-03-27T09:00', { title: 'y' });
		planner.updateFollowing('owner', series.id, '2026-03-28T09:00', { title: 'z' });
		for (const entry of planner.changeLog()) {
			expect(actionName(entry.action), entry.action).toMatch(/^[А-Яа-яЁё]+(?: [А-Яа-яЁё]+)*: [а-яё]/);
		}
		expect(actionName('feed.regenerate')).toBe('Календарная лента: новая секретная ссылка');
		expect(actionName('event.split.undo')).toBe('Событие: отмена (разделение серии)');
	});
});
