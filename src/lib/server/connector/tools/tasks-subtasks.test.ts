import { describe, expect, it } from 'vitest';
import { createTestConnector, toolJson } from '../testing/harness.js';

describe('create_task with subtasks', () => {
	it('creates the Task and its Subtasks in one call, as one claude change', async () => {
		const t = createTestConnector();
		const claude = await t.connectClaude();
		const made = toolJson<{ subtasks: { title: string; done: boolean }[] }>(
			await claude.callTool({
				name: 'create_task',
				arguments: { title: 'Чтение', subtasks: ['a', 'b'] }
			})
		);
		expect(made.subtasks.map((s) => [s.title, s.done])).toEqual([
			['a', false],
			['b', false]
		]);
		expect(t.planner.changeLog().map((e) => [e.action, e.actor])).toEqual([
			['task.create', 'claude']
		]);

		const bad = await claude.callTool({
			name: 'create_task',
			arguments: { title: 'X', subtasks: [' '] }
		});
		expect(bad.isError).toBe(true);
		expect(t.planner.listTasks()).toHaveLength(1);
	});
});
