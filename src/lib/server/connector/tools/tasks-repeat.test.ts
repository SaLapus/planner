import { describe, expect, it } from 'vitest';
import { createTestConnector, toolJson } from '../testing/harness.js';

type T = { id: number; dueDate: string; nextId: number | null; repeat: unknown };

describe('Repeating Task tools', () => {
	it('Claude sets a repetition; completing links the next instance and uncompleting removes it', async () => {
		const claude = await createTestConnector().connectClaude();
		const call = async <R>(name: string, args: Record<string, unknown>) =>
			toolJson<R>(await claude.callTool({ name, arguments: args }));

		const task = await call<T>('create_task', {
			title: 'Полить цветы',
			due: '2026-03-30',
			repeat: { type: 'fixed', rrule: 'FREQ=WEEKLY;BYDAY=MO' }
		});
		expect(task.repeat).toEqual({ type: 'fixed', rrule: 'FREQ=WEEKLY;BYDAY=MO' });

		const done = await call<T>('complete_task', { id: task.id });
		const found = await call<T[]>('search_tasks', { text: 'цветы' });
		expect(found.map((t) => t.id)).toContain(done.nextId);

		await call('uncomplete_task', { id: task.id });
		expect(await call<T[]>('search_tasks', { text: 'цветы' })).toHaveLength(1);

		const changed = await call<T>('update_task', {
			id: task.id,
			repeat: { type: 'after', every: 3, unit: 'day' }
		});
		expect(changed.repeat).toEqual({ type: 'after', every: 3, unit: 'day' });
		expect((await call<T>('update_task', { id: task.id, repeat: null })).repeat).toBeNull();
	});

	it('a fixed repetition without a due date is a tool error', async () => {
		const claude = await createTestConnector().connectClaude();
		const res = await claude.callTool({
			name: 'create_task',
			arguments: { title: 'x', repeat: { type: 'fixed', rrule: 'FREQ=DAILY' } }
		});
		expect(res.isError).toBe(true);
	});
});
