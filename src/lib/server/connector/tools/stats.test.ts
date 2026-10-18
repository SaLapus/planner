import { describe, expect, it } from 'vitest';
import { createTestConnector, toolJson } from '../testing/harness.js';

describe('get_stats over MCP', () => {
	it('returns habit periods, weekly task counts and goals', async () => {
		const t = createTestConnector();
		const claude = await t.connectClaude();

		const stats = toolJson<{ habits: unknown[]; tasksPerWeek: unknown[]; goals: unknown[] }>(
			await claude.callTool({ name: 'get_stats', arguments: { weeks: 3 } })
		);

		expect(stats.tasksPerWeek).toHaveLength(3);
		expect(stats.habits).toEqual([]);
		expect(stats.goals).toEqual([]);
	});
});
