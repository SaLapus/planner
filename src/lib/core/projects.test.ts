import { describe, expect, it } from 'vitest';
import { createTestPlanner } from './testing/harness.js';

describe('projects', () => {
	it('creates, renames and lists projects, one change-log entry each', () => {
		const { planner } = createTestPlanner();
		const p = planner.createProject('owner', { name: ' Дом ' });
		expect(p).toMatchObject({ name: 'Дом', archivedAt: null });

		const renamed = planner.renameProject('claude', p.id, 'Квартира');
		expect(renamed.name).toBe('Квартира');
		expect(planner.listProjects()).toEqual([renamed]);

		const log = planner.changeLog();
		expect(log.map((e) => [e.actor, e.action])).toEqual([
			['owner', 'project.create'],
			['claude', 'project.rename']
		]);
		expect(log[1].before).toMatchObject({ name: 'Дом' });
		expect(log[1].after).toMatchObject({ name: 'Квартира' });
	});

	it('rejects empty names', () => {
		const { planner } = createTestPlanner();
		expect(() => planner.createProject('owner', { name: ' ' })).toThrow(/name/i);
	});

	it('archived projects are hidden by default but can be listed and restored', () => {
		const { planner, clock } = createTestPlanner({ now: '2026-03-01T10:00:00.000Z' });
		const a = planner.createProject('owner', { name: 'A' });
		const b = planner.createProject('owner', { name: 'B' });
		clock.set('2026-03-02T10:00:00.000Z');
		const archived = planner.archiveProject('owner', a.id);
		expect(archived.archivedAt).toBe('2026-03-02T10:00:00.000Z');

		expect(planner.listProjects().map((p) => p.id)).toEqual([b.id]);
		expect(planner.listProjects({ includeArchived: true }).map((p) => p.id)).toEqual([a.id, b.id]);

		expect(() => planner.archiveProject('owner', a.id)).toThrow(/already/i);
		expect(planner.unarchiveProject('owner', a.id).archivedAt).toBeNull();
		expect(planner.listProjects()).toHaveLength(2);
	});
});

describe('assigning tasks to projects', () => {
	it('a task has 0..1 project; filter by project', () => {
		const { planner } = createTestPlanner();
		const home = planner.createProject('owner', { name: 'Дом' });
		const work = planner.createProject('owner', { name: 'Работа' });
		const t1 = planner.createTask('owner', { title: 'a', projectId: home.id });
		const t2 = planner.createTask('owner', { title: 'b' });
		planner.setTaskProject('owner', t2.id, work.id);

		expect(planner.getTask(t1.id).projectId).toBe(home.id);
		expect(planner.listTasks({ projectId: work.id }).map((t) => t.title)).toEqual(['b']);
		expect(planner.listTasks({ projectId: null }).map((t) => t.title)).toEqual([]);

		const cleared = planner.setTaskProject('owner', t2.id, null);
		expect(cleared.projectId).toBeNull();
		expect(planner.listTasks({ projectId: null }).map((t) => t.title)).toEqual(['b']);
	});

	it('logs the full task before and after', () => {
		const { planner } = createTestPlanner();
		const p = planner.createProject('owner', { name: 'P' });
		const t = planner.createTask('owner', { title: 'a' });
		planner.setTaskProject('claude', t.id, p.id);
		const e = planner.changeLog().at(-1)!;
		expect(e).toMatchObject({ actor: 'claude', action: 'task.set_project', entityType: 'task' });
		expect(e.before).toMatchObject({ projectId: null, title: 'a' });
		expect(e.after).toMatchObject({ projectId: p.id, title: 'a' });
	});

	it('rejects unknown and archived projects; archived project keeps its tasks reachable', () => {
		const { planner } = createTestPlanner();
		const p = planner.createProject('owner', { name: 'P' });
		const t = planner.createTask('owner', { title: 'a', projectId: p.id });
		planner.archiveProject('owner', p.id);

		expect(() => planner.setTaskProject('owner', t.id, 999)).toThrow(/not found/i);
		const other = planner.createTask('owner', { title: 'b' });
		expect(() => planner.setTaskProject('owner', other.id, p.id)).toThrow(/archived/i);

		expect(planner.listTasks({ projectId: p.id }).map((x) => x.title)).toEqual(['a']);
		expect(planner.listTasks().map((x) => x.title)).toEqual(['a', 'b']);
	});
});
