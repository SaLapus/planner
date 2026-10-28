import { describe, expect, it } from 'vitest';
import { createTestConnector, toolJson } from '../testing/harness.js';

type T = {
	id: number;
	title: string;
	notes: string;
	dueDate: string | null;
	timeBlock: { minutes: number } | null;
	repeat: unknown;
	nextId: number | null;
	completedAt: string | null;
	subtasks: { title: string; done: boolean }[];
};

describe('duplicate_task', () => {
	it('duplicates with the source dates, as actor claude, unlinked and not repeating', async () => {
		const t = createTestConnector();
		const claude = await t.connectClaude();
		const call = async (name: string, args: Record<string, unknown>) =>
			toolJson<T>(await claude.callTool({ name, arguments: args }));
		const src = await call('create_task', {
			title: 'Чтение',
			notes: 'Skiena 3.4',
			due: '2026-01-09',
			time_block: { start: '2026-01-09T10:00', minutes: 45 },
			repeat: { type: 'after', every: 1, unit: 'week' },
			subtasks: ['a']
		});
		await call('complete_task', { id: src.id });

		const d = await call('duplicate_task', { id: src.id });
		expect(d).toMatchObject({
			title: 'Чтение',
			notes: 'Skiena 3.4',
			dueDate: '2026-01-09',
			repeat: null,
			nextId: null,
			completedAt: null
		});
		expect(d.id).not.toBe(src.id);
		expect(d.timeBlock?.minutes).toBe(45);
		expect(d.subtasks).toEqual([expect.objectContaining({ title: 'a', done: false })]);
		expect(t.planner.changeLog().at(-1)).toMatchObject({ action: 'task.create', actor: 'claude' });
	});

	it('takes due, start and time_block; null clears due and time_block', async () => {
		const claude = await createTestConnector().connectClaude();
		const call = async (name: string, args: Record<string, unknown>) =>
			toolJson<T & { startDate: string }>(await claude.callTool({ name, arguments: args }));
		const src = await call('create_task', {
			title: 'x',
			due: '2026-01-09',
			time_block: { start: '2026-01-09T10:00', minutes: 45 }
		});
		const moved = await call('duplicate_task', {
			id: src.id,
			due: '2026-01-16',
			start: '2026-01-14',
			time_block: { start: '2026-01-16T10:00', minutes: 30 }
		});
		expect(moved).toMatchObject({ dueDate: '2026-01-16', startDate: '2026-01-14' });
		expect(moved.timeBlock?.minutes).toBe(30);
		const cleared = await call('duplicate_task', { id: src.id, due: null, time_block: null });
		expect(cleared).toMatchObject({ dueDate: null, timeBlock: null });
	});

	it('reports a readable error for a Task in Trash', async () => {
		const t = createTestConnector();
		const claude = await t.connectClaude();
		const src = toolJson<T>(
			await claude.callTool({ name: 'create_task', arguments: { title: 'gone' } })
		);
		await claude.callTool({ name: 'delete_item', arguments: { type: 'task', id: src.id } });
		const res = await claude.callTool({ name: 'duplicate_task', arguments: { id: src.id } });
		expect(res.isError).toBe(true);
		expect(JSON.stringify(res.content)).toMatch(/trash/i);
	});
});
