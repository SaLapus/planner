import { describe, expect, it } from 'vitest';
import { createTestConnector, toolJson } from '../testing/harness.js';

interface TaskJson {
	id: number;
	title: string;
	projectId: number | null;
	tags: string[];
	subtasks: { id: number; title: string; done: boolean }[];
}

describe('organising tools', () => {
	it('creates a Task with a Project and Tags, reads it back filtered', async () => {
		const t = createTestConnector();
		const claude = await t.connectClaude();
		const call = async <T>(name: string, args: Record<string, unknown>) =>
			toolJson<T>(await claude.callTool({ name, arguments: args }));

		const project = await call<{ id: number }>('create_project', { name: 'Дом' });
		const task = await call<TaskJson>('create_task', {
			title: 'Починить кран',
			project_id: project.id,
			tags: ['срочно', 'дом']
		});
		await call('create_task', { title: 'Другое' });

		const byProject = await call<TaskJson[]>('list_tasks', { project_id: project.id });
		expect(byProject.map((x) => x.id)).toEqual([task.id]);
		expect(byProject[0]).toMatchObject({ projectId: project.id, tags: ['дом', 'срочно'] });
		const byTag = await call<TaskJson[]>('list_tasks', { tag: 'срочно' });
		expect(byTag.map((x) => x.title)).toEqual(['Починить кран']);

		expect(t.planner.changeLog().every((e) => e.actor === 'claude')).toBe(true);
	});

	it('manages projects, tags and subtasks', async () => {
		const t = createTestConnector();
		const claude = await t.connectClaude();
		const call = async <T>(name: string, args: Record<string, unknown> = {}) =>
			toolJson<T>(await claude.callTool({ name, arguments: args }));

		const p = await call<{ id: number }>('create_project', { name: 'A' });
		expect(await call<{ name: string }>('rename_project', { id: p.id, name: 'B' })).toMatchObject({
			name: 'B'
		});
		const task = await call<TaskJson>('create_task', { title: 'x' });
		const assigned = await call<TaskJson>('set_task_project', {
			task_id: task.id,
			project_id: p.id
		});
		expect(assigned.projectId).toBe(p.id);
		await call('archive_project', { id: p.id });
		expect(await call<unknown[]>('list_projects')).toEqual([]);
		expect(await call<unknown[]>('list_projects', { include_archived: true })).toHaveLength(1);
		expect(await call<TaskJson[]>('list_tasks', { project_id: p.id })).toHaveLength(1);

		await call('add_tag', { task_id: task.id, tag: 't' });
		expect(await call('list_tags')).toEqual([{ tag: 't', count: 1 }]);
		expect((await call<TaskJson>('remove_tag', { task_id: task.id, tag: 't' })).tags).toEqual([]);

		await call('add_subtask', { task_id: task.id, title: 'a' });
		const two = await call<TaskJson>('add_subtask', { task_id: task.id, title: 'b' });
		const [a, b] = two.subtasks;
		const re = await call<TaskJson>('reorder_subtasks', {
			task_id: task.id,
			ordered_ids: [b.id, a.id]
		});
		expect(re.subtasks.map((s) => s.title)).toEqual(['b', 'a']);
		const checked = await call<TaskJson>('set_subtask_done', {
			task_id: task.id,
			subtask_id: a.id,
			done: true
		});
		expect(checked.subtasks.find((s) => s.id === a.id)!.done).toBe(true);
		const removed = await call<TaskJson>('remove_subtask', { task_id: task.id, subtask_id: a.id });
		expect(removed.subtasks).toHaveLength(1);

		const bad = await claude.callTool({
			name: 'set_task_project',
			arguments: { task_id: task.id, project_id: p.id + 100 }
		});
		expect(bad.isError).toBe(true);
	});
});
