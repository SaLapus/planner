import { describe, expect, it } from 'vitest';
import { createTestConnector, toolJson } from '../testing/harness.js';

type Item = { kind: string; placement?: string; id: number; title: string; startHome: string };

describe('Time block tools', () => {
	it('Claude sets and clears a Time block; get_agenda returns typed Task items', async () => {
		const t = createTestConnector();
		const claude = await t.connectClaude();
		const call = async <R>(name: string, args: Record<string, unknown>) =>
			toolJson<R>(await claude.callTool({ name, arguments: args }));

		const task = await call<{ id: number }>('create_task', {
			title: 'Отчёт',
			due: '2026-03-30',
			time_block: { start: '2026-03-30T09:00', minutes: 90 }
		});
		await call('create_event', { title: 'Встреча', start: '2026-03-30T12:00' });
		await call('create_task', { title: 'Хлеб', due: '2026-03-30' });

		const range = { from: '2026-03-30', to: '2026-03-30' };
		const agenda = await call<Item[]>('get_agenda', range);
		expect(agenda.map((i) => [i.kind, i.placement, i.title])).toEqual([
			['task', 'due', 'Хлеб'],
			['task', 'time_block', 'Отчёт'],
			['event', undefined, 'Встреча']
		]);
		expect(agenda[1].startHome).toBe('2026-03-30T09:00');

		await call('update_task', { id: task.id, time_block: null });
		const after = await call<Item[]>('get_agenda', range);
		// still due that day, so it is now a plain due entry
		expect(after.map((i) => [i.placement, i.title])).toEqual([
			['due', 'Отчёт'],
			['due', 'Хлеб'],
			[undefined, 'Встреча']
		]);

		expect(t.planner.changeLog({ actor: 'claude' }).map((e) => e.action)).toContain('task.update');
	});

	it('a bad Time block is a tool error', async () => {
		const claude = await createTestConnector().connectClaude();
		const res = await claude.callTool({
			name: 'create_task',
			arguments: { title: 'x', time_block: { start: 'noon', minutes: 30 } }
		});
		expect(res.isError).toBe(true);
	});
});
