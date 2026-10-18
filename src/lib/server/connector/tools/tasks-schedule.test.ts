import { describe, expect, it } from 'vitest';
import { createTestConnector, toolJson } from '../testing/harness.js';

type T = { id: number; title: string; dueDate: string | null; dueTime: string | null; priority: string };

describe('task scheduling tools', () => {
	it('create_task and update_task take ISO due and priority, as actor claude', async () => {
		const t = createTestConnector();
		const claude = await t.connectClaude();

		const made = toolJson<T>(
			await claude.callTool({
				name: 'create_task',
				arguments: { title: 'Позвонить', due: '2031-05-04T09:30', priority: 'high' }
			})
		);
		expect(made).toMatchObject({ dueDate: '2031-05-04', dueTime: '09:30', priority: 'high' });

		const changed = toolJson<T>(
			await claude.callTool({ name: 'update_task', arguments: { id: made.id, due: null, priority: 'low' } })
		);
		expect(changed).toMatchObject({ dueDate: null, dueTime: null, priority: 'low' });
		expect(t.planner.changeLog().map((e) => [e.action, e.actor])).toEqual([
			['task.create', 'claude'],
			['task.update', 'claude']
		]);
	});

	it('bad input comes back as a readable tool error', async () => {
		const claude = await createTestConnector().connectClaude();
		const res = await claude.callTool({ name: 'create_task', arguments: { title: 'x', due: 'tomorrow' } });
		expect(res.isError).toBe(true);
	});

	it('get_task_list returns the smart lists and search_tasks finds by text', async () => {
		const t = createTestConnector();
		const claude = await t.connectClaude();
		const call = async (name: string, args: Record<string, unknown>) =>
			toolJson<T[]>(await claude.callTool({ name, arguments: args }));
		await call('create_task', { title: 'old', due: '2001-01-01' });
		await call('create_task', { title: 'later', due: '2999-01-01' });
		await call('create_task', { title: 'Молоко' });

		expect((await call('get_task_list', { list: 'overdue' })).map((x) => x.title)).toEqual(['old']);
		expect((await call('get_task_list', { list: 'upcoming' })).map((x) => x.title)).toEqual(['later']);
		expect((await call('get_task_list', { list: 'inbox' })).map((x) => x.title)).toEqual(['Молоко']);
		expect((await call('get_task_list', { list: 'today' }))).toEqual([]);
		expect((await call('search_tasks', { text: 'МОЛОКО' })).map((x) => x.title)).toEqual(['Молоко']);
	});
});
