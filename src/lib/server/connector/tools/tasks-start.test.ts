import { describe, expect, it } from 'vitest';
import { createTestConnector, toolJson } from '../testing/harness.js';

type T = { id: number; title: string; startDate: string; dueDate: string | null };

describe('task Start date tools', () => {
	it('create_task and update_task set, keep and reset the Start date, as actor claude', async () => {
		const t = createTestConnector();
		const claude = await t.connectClaude();
		const call = async (name: string, args: Record<string, unknown>) =>
			toolJson<T>(await claude.callTool({ name, arguments: args }));

		const made = await call('create_task', { title: 'Later', start: '2031-05-01', due: '2031-05-10' });
		expect(made.startDate).toBe('2031-05-01');

		const kept = await call('update_task', { id: made.id, title: 'Later!' });
		expect(kept.startDate).toBe('2031-05-01');

		const moved = await call('update_task', { id: made.id, start: '2031-05-05' });
		expect(moved.startDate).toBe('2031-05-05');

		const reset = await call('update_task', { id: made.id, start: null });
		expect(reset.startDate).not.toBe('2031-05-05');
		expect(reset.startDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);

		expect(t.planner.changeLog().map((e) => [e.action, e.actor])).toEqual([
			['task.create', 'claude'],
			['task.update', 'claude'],
			['task.update', 'claude'],
			['task.update', 'claude']
		]);
	});

	it('every listing tool returns startDate', async () => {
		const claude = await createTestConnector().connectClaude();
		const call = async (name: string, args: Record<string, unknown>) =>
			toolJson<T[]>(await claude.callTool({ name, arguments: args }));
		await claude.callTool({
			name: 'create_task',
			arguments: { title: 'Milk', due: '2999-01-01', start: '2998-12-01' }
		});
		for (const [name, args] of [
			['list_tasks', {}],
			['search_tasks', { text: 'milk' }],
			['get_task_list', { list: 'upcoming' }]
		] as const) {
			expect((await call(name, args)).map((x) => x.startDate), name).toEqual(['2998-12-01']);
		}
	});

	it('an invalid Start date, or one after the due date, is a readable tool error', async () => {
		const claude = await createTestConnector().connectClaude();
		const bad = await claude.callTool({ name: 'create_task', arguments: { title: 'x', start: 'soon' } });
		expect(bad.isError).toBe(true);
		const after = await claude.callTool({
			name: 'create_task',
			arguments: { title: 'x', start: '2031-05-11', due: '2031-05-10' }
		});
		expect(after.isError).toBe(true);
		expect(JSON.stringify(after.content)).toMatch(/after the due date/);
		const made = toolJson<T>(
			await claude.callTool({ name: 'create_task', arguments: { title: 'y', due: '2031-05-10' } })
		);
		const upd = await claude.callTool({ name: 'update_task', arguments: { id: made.id, start: '2031-06-01' } });
		expect(upd.isError).toBe(true);
	});
});
