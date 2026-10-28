import { describe, expect, it } from 'vitest';
import { createTestConnector, toolJson } from '../testing/harness.js';

type T = { id: number; title: string; notes: string };

describe('task Notes tools', () => {
	it('create_task and update_task set, keep and clear Notes (null and ""), as actor claude', async () => {
		const t = createTestConnector();
		const claude = await t.connectClaude();
		const call = async (name: string, args: Record<string, unknown>) =>
			toolJson<T>(await claude.callTool({ name, arguments: args }));

		const made = await call('create_task', { title: 'Чтение', notes: 'Skiena, гл. 3.4' });
		expect(made.notes).toBe('Skiena, гл. 3.4');

		expect((await call('update_task', { id: made.id, title: 'Чтение!' })).notes).toBe('Skiena, гл. 3.4');
		expect((await call('update_task', { id: made.id, notes: 'стр. 87' })).notes).toBe('стр. 87');
		expect((await call('update_task', { id: made.id, notes: null })).notes).toBe('');

		await call('update_task', { id: made.id, notes: 'again' });
		expect((await call('update_task', { id: made.id, notes: '' })).notes).toBe('');

		expect((await call('create_task', { title: 'plain' })).notes).toBe('');
		expect((await call('create_task', { title: 'nulled', notes: null })).notes).toBe('');
		expect(t.planner.changeLog().every((e) => e.actor === 'claude')).toBe(true);
	});

	it('every tool that returns Tasks includes notes', async () => {
		const claude = await createTestConnector().connectClaude();
		const call = async (name: string, args: Record<string, unknown>) =>
			toolJson<T | T[]>(await claude.callTool({ name, arguments: args }));
		const made = (await call('create_task', { title: 'Milk', due: '2999-01-01', notes: 'n' })) as T;
		const lists = [
			await call('list_tasks', {}),
			await call('search_tasks', { text: 'Milk' }),
			await call('get_task_list', { list: 'upcoming' })
		] as T[][];
		for (const l of lists) expect(l.map((x) => x.notes)).toEqual(['n']);
		expect(((await call('complete_task', { id: made.id })) as T).notes).toBe('n');
	});
});
