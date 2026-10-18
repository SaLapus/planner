// Project management page (create / rename / archive). Only translates form posts into core calls.
import { fail } from '@sveltejs/kit';
import { getPlanner } from '#lib/server/planner.js';
import type { Actions, PageServerLoad } from './$types';

function actorOf(locals: App.Locals) {
	if (!locals.actor) throw new Error('Not authenticated');
	return locals.actor;
}

export const load: PageServerLoad = () => ({
	projects: getPlanner().listProjects({ includeArchived: true })
});

function run(fn: () => unknown) {
	try {
		fn();
	} catch (e) {
		return fail(400, { error: e instanceof Error ? e.message : 'Ошибка' });
	}
}

export const actions: Actions = {
	create: async ({ request, locals }) => {
		const f = await request.formData();
		return run(() => getPlanner().createProject(actorOf(locals), { name: String(f.get('name') ?? '') }));
	},
	rename: async ({ request, locals }) => {
		const f = await request.formData();
		return run(() =>
			getPlanner().renameProject(actorOf(locals), Number(f.get('id')), String(f.get('name') ?? ''))
		);
	},
	archive: async ({ request, locals }) => {
		const f = await request.formData();
		return run(() => getPlanner().archiveProject(actorOf(locals), Number(f.get('id'))));
	},
	unarchive: async ({ request, locals }) => {
		const f = await request.formData();
		return run(() => getPlanner().unarchiveProject(actorOf(locals), Number(f.get('id'))));
	}
};
