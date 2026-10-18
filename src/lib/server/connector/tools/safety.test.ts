import { describe, expect, it } from 'vitest';
import { createTestConnector, toolJson } from '../testing/harness.js';

describe('safety tools over MCP', () => {
	it('undo_change reverts a change Claude made', async () => {
		const t = createTestConnector();
		const claude = await t.connectClaude();
		await claude.callTool({ name: 'create_task', arguments: { title: 'Ошибка' } });
		const [entry] = toolJson<{ id: number; actor: string }[]>(
			await claude.callTool({ name: 'list_changes', arguments: { actor: 'claude' } })
		);
		expect(entry.actor).toBe('claude');

		const undone = await claude.callTool({ name: 'undo_change', arguments: { id: entry.id } });

		expect(undone.isError).toBeFalsy();
		expect(t.planner.listTasks()).toEqual([]);
		expect(t.planner.changeLog().at(-1)).toMatchObject({ actor: 'claude', action: 'task.create.undo' });
	});

	it('undo_change returns the refusal reason as a readable error', async () => {
		const t = createTestConnector();
		const claude = await t.connectClaude();
		const { id } = toolJson<{ id: number }>(
			await claude.callTool({ name: 'create_task', arguments: { title: 'x' } })
		);
		await claude.callTool({ name: 'complete_task', arguments: { id } });
		const createEntry = t.planner.changeLog()[0];

		const res = await claude.callTool({ name: 'undo_change', arguments: { id: createEntry.id } });

		expect(res.isError).toBe(true);
		expect(JSON.stringify(res.content)).toMatch(/changed after/);
	});

	it('delete_item, list_trash and restore_item', async () => {
		const t = createTestConnector();
		const claude = await t.connectClaude();
		const { id } = toolJson<{ id: number }>(
			await claude.callTool({ name: 'create_task', arguments: { title: 'x' } })
		);

		await claude.callTool({ name: 'delete_item', arguments: { type: 'task', id } });
		expect(t.planner.listTasks()).toEqual([]);
		const trash = toolJson<{ entityId: number }[]>(
			await claude.callTool({ name: 'list_trash', arguments: {} })
		);
		expect(trash.map((i) => i.entityId)).toEqual([id]);

		await claude.callTool({ name: 'restore_item', arguments: { type: 'task', id } });
		expect(t.planner.listTasks()).toHaveLength(1);
		expect(t.planner.changeLog().map((e) => e.actor)).toEqual(['claude', 'claude', 'claude']);
	});
});
