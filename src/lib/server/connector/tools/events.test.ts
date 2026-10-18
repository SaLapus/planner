import { describe, expect, it } from 'vitest';
import { createTestConnector, toolJson } from '../testing/harness.js';

type Item = { kind: string; id: number; title: string; startLocal: string };

describe('Event tools', () => {
	it('an Event created by Claude shows up in get_agenda, logged as actor claude', async () => {
		const t = createTestConnector();
		const claude = await t.connectClaude();

		const created = toolJson<{ id: number }>(
			await claude.callTool({
				name: 'create_event',
				arguments: { title: 'Встреча', start: '2026-03-30T10:00', timeZone: 'Europe/Kyiv' }
			})
		);
		const agenda = toolJson<Item[]>(
			await claude.callTool({
				name: 'get_agenda',
				arguments: { from: '2026-03-30', to: '2026-03-30' }
			})
		);

		expect(agenda).toEqual([
			expect.objectContaining({
				kind: 'event',
				id: created.id,
				title: 'Встреча',
				startLocal: '2026-03-30T10:00'
			})
		]);
		expect(t.planner.changeLog()).toEqual([
			expect.objectContaining({ actor: 'claude', action: 'event.create', entityId: created.id })
		]);
	});

	it('update, delete and restore work; rule violations are tool errors', async () => {
		const t = createTestConnector();
		const claude = await t.connectClaude();
		const { id } = toolJson<{ id: number }>(
			await claude.callTool({
				name: 'create_event',
				arguments: { title: 'ДР', allDay: true, start: '2026-04-01' }
			})
		);
		const range = { from: '2026-04-01', to: '2026-04-01' };
		const agenda = async () =>
			toolJson<Item[]>(await claude.callTool({ name: 'get_agenda', arguments: range }));

		await claude.callTool({ name: 'update_event', arguments: { id, title: 'День рождения' } });
		expect((await agenda())[0].title).toBe('День рождения');

		await claude.callTool({ name: 'delete_event', arguments: { id } });
		expect(await agenda()).toEqual([]);
		await claude.callTool({ name: 'restore_event', arguments: { id } });
		expect(await agenda()).toHaveLength(1);

		const bad = await claude.callTool({ name: 'create_event', arguments: { title: 'x', start: 'soon' } });
		expect(bad.isError).toBe(true);
	});
});
