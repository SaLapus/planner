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

export const load: PageServerLoad = () => {
	return { tasks: getPlanner().listTasks() };
};

export const actions: Actions = {
	add: async ({ request, locals }) => {
		const title = String((await request.formData()).get('title') ?? '');
		try {
			getPlanner().createTask(actorOf(locals), { title });
		} catch (e) {
			return fail(400, { title, error: e instanceof Error ? e.message : 'Ошибка' });
		}
	},
	// Delete = move to Trash (restorable on /trash). Works the same for any entity type.
	delete: async ({ request, locals }) => {
		const id = Number((await request.formData()).get('id'));
		try {
			getPlanner().deleteItem(actorOf(locals), 'task', id);
		} catch (e) {
			return fail(400, { error: e instanceof Error ? e.message : 'Ошибка' });
		}
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
