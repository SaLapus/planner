// Server-side half of the page. Svelte note: SvelteKit runs `load` on the
// server before showing the page, and `actions` receive <form> posts.
// This file only translates form data into core calls; all rules live in the core.
import { fail } from '@sveltejs/kit';
import { getPlanner } from '#lib/server/planner.js';
import type { Actions, PageServerLoad } from './$types';

// Every UI request has passed the login check in hooks.server.ts, which sets locals.actor to 'owner'.
function actorOf(locals: App.Locals) {
	if (!locals.actor) throw new Error('Not authenticated');
	return locals.actor;
}

// The address decides the view: /?project=3 (by project), /?project=none, /?tag=дом (by tag).
export const load: PageServerLoad = ({ url }) => {
	const planner = getPlanner();
	const p = url.searchParams.get('project');
	const tag = url.searchParams.get('tag') ?? undefined;
	const projectId = p === null ? undefined : p === 'none' ? null : Number(p);
	return {
		tasks: planner.listTasks({ projectId, tag }),
		projects: planner.listProjects(),
		// every project incl. archived, so a task in an archived project can still show its name
		allProjects: planner.listProjects({ includeArchived: true }),
		tags: planner.listTags(),
		filter: { project: p, tag: tag ?? null }
	};
};

// Runs a core call and turns a rule violation into a visible error message.
function run(fn: () => unknown) {
	try {
		fn();
	} catch (e) {
		return fail(400, { error: e instanceof Error ? e.message : 'Ошибка' });
	}
}

export const actions: Actions = {
	add: async ({ request, locals }) => {
		const title = String((await request.formData()).get('title') ?? '');
		try {
			getPlanner().createTask(actorOf(locals), { title });
		} catch (e) {
			return fail(400, { title, error: e instanceof Error ? e.message : 'Ошибка' });
		}
	},
	setProject: async ({ request, locals }) => {
		const f = await request.formData();
		const raw = String(f.get('projectId') ?? '');
		return run(() =>
			getPlanner().setTaskProject(actorOf(locals), Number(f.get('id')), raw === '' ? null : Number(raw))
		);
	},
	addTag: async ({ request, locals }) => {
		const f = await request.formData();
		return run(() => getPlanner().addTag(actorOf(locals), Number(f.get('id')), String(f.get('tag') ?? '')));
	},
	removeTag: async ({ request, locals }) => {
		const f = await request.formData();
		return run(() => getPlanner().removeTag(actorOf(locals), Number(f.get('id')), String(f.get('tag') ?? '')));
	},
	addSubtask: async ({ request, locals }) => {
		const f = await request.formData();
		return run(() =>
			getPlanner().addSubtask(actorOf(locals), Number(f.get('id')), String(f.get('title') ?? ''))
		);
	},
	toggleSubtask: async ({ request, locals }) => {
		const f = await request.formData();
		return run(() =>
			getPlanner().setSubtaskDone(
				actorOf(locals),
				Number(f.get('id')),
				Number(f.get('subtaskId')),
				f.get('done') === 'true'
			)
		);
	},
	removeSubtask: async ({ request, locals }) => {
		const f = await request.formData();
		return run(() =>
			getPlanner().removeSubtask(actorOf(locals), Number(f.get('id')), Number(f.get('subtaskId')))
		);
	},
	moveSubtask: async ({ request, locals }) => {
		// "dir" is -1 (up) or 1 (down): swap the subtask with its neighbour.
		const f = await request.formData();
		const id = Number(f.get('id'));
		const subtaskId = Number(f.get('subtaskId'));
		const dir = Number(f.get('dir'));
		return run(() => {
			const planner = getPlanner();
			const ids = planner.getTask(id).subtasks.map((s) => s.id);
			const i = ids.indexOf(subtaskId);
			const j = i + dir;
			if (i < 0 || j < 0 || j >= ids.length) return;
			[ids[i], ids[j]] = [ids[j], ids[i]];
			planner.reorderSubtasks(actorOf(locals), id, ids);
		});
	},
	toggle: async ({ request, locals }) => {
		const form = await request.formData();
		const id = Number(form.get('id'));
		const planner = getPlanner();
		try {
			if (form.get('done') === 'true') planner.completeTask(actorOf(locals), id);
			else planner.uncompleteTask(actorOf(locals), id);
		} catch (e) {
			return fail(400, { error: e instanceof Error ? e.message : 'Ошибка' });
		}
	}
};
