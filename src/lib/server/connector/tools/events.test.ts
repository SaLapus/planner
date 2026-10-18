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

		await claude.callTool({ name: 'delete_item', arguments: { type: 'event', id } });
		expect(await agenda()).toEqual([]);
		await claude.callTool({ name: 'restore_item', arguments: { type: 'event', id } });
		expect(await agenda()).toHaveLength(1);

		const bad = await claude.callTool({ name: 'create_event', arguments: { title: 'x', start: 'soon' } });
		expect(bad.isError).toBe(true);
	});
});

describe('recurring Event tools', () => {
	type Occ = Item & { recurrenceId: string | null };

	async function setup() {
		const t = createTestConnector();
		const claude = await t.connectClaude();
		const { id } = toolJson<{ id: number }>(
			await claude.callTool({
				name: 'create_event',
				arguments: {
					title: 'Зарядка',
					start: '2026-03-30T08:00',
					recurrence: 'FREQ=WEEKLY;BYDAY=MO,WE,FR'
				}
			})
		);
		const week = async () =>
			toolJson<Occ[]>(
				await claude.callTool({ name: 'get_agenda', arguments: { from: '2026-03-30', to: '2026-04-05' } })
			);
		return { t, claude, id, week };
	}

	it('get_agenda expands occurrences with their recurrenceId', async () => {
		const { week, id } = await setup();
		expect((await week()).map((o) => [o.id, o.recurrenceId])).toEqual([
			[id, '2026-03-30T08:00'],
			[id, '2026-04-01T08:00'],
			[id, '2026-04-03T08:00']
		]);
	});

	it('cancel_occurrence and update_event with recurrenceId (this occurrence by default)', async () => {
		const { claude, id, week } = await setup();
		await claude.callTool({ name: 'cancel_occurrence', arguments: { id, recurrenceId: '2026-04-01T08:00' } });
		await claude.callTool({
			name: 'update_event',
			arguments: { id, recurrenceId: '2026-04-03T08:00', title: 'Бассейн' }
		});
		expect((await week()).map((o) => o.title)).toEqual(['Зарядка', 'Бассейн']);
	});

	it('scope "following" splits the series; scope "all" with a recurrenceId is refused', async () => {
		const { claude, id, week } = await setup();
		const split = toolJson<{ id: number }>(
			await claude.callTool({
				name: 'update_event',
				arguments: { id, recurrenceId: '2026-04-01T08:00', scope: 'following', title: 'Новая' }
			})
		);
		expect(split.id).not.toBe(id);
		expect((await week()).map((o) => o.title)).toEqual(['Зарядка', 'Новая', 'Новая']);
		const bad = await claude.callTool({
			name: 'update_event',
			arguments: { id, recurrenceId: '2026-04-01T08:00', scope: 'all', title: 'x' }
		});
		expect(bad.isError).toBe(true);
	});

	it('update_event without recurrenceId changes the whole series; recurrence null makes it one-off', async () => {
		const { claude, id, week } = await setup();
		await claude.callTool({ name: 'update_event', arguments: { id, recurrence: null } });
		expect(await week()).toHaveLength(1);
	});

	it('an invalid rule is a tool error', async () => {
		const { claude } = await setup();
		const bad = await claude.callTool({
			name: 'create_event',
			arguments: { title: 'x', start: '2026-03-30T08:00', recurrence: 'FREQ=SOMETIMES' }
		});
		expect(bad.isError).toBe(true);
	});
});
