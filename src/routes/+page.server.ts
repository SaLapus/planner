// Server-side half of the page. Svelte note: SvelteKit runs `load` on the
// server before showing the page, and `actions` receive <form> posts.
// This file only translates form data into core calls; all rules live in the core.
import { fail } from '@sveltejs/kit';
import { getPlanner } from '#lib/server/planner.js';
import type { Actions, PageServerLoad } from './$types';

// Until login exists (a later ticket), everyone using the web UI is the owner.
const ACTOR = 'owner' as const;

export const load: PageServerLoad = () => {
	return { tasks: getPlanner().listTasks() };
};

export const actions: Actions = {
	add: async ({ request }) => {
		const title = String((await request.formData()).get('title') ?? '');
		try {
			getPlanner().createTask(ACTOR, { title });
		} catch (e) {
			return fail(400, { title, error: e instanceof Error ? e.message : 'Ошибка' });
		}
	},
	toggle: async ({ request }) => {
		const form = await request.formData();
		const id = Number(form.get('id'));
		const planner = getPlanner();
		try {
			if (form.get('done') === 'true') planner.completeTask(ACTOR, id);
			else planner.uncompleteTask(ACTOR, id);
		} catch (e) {
			return fail(400, { error: e instanceof Error ? e.message : 'Ошибка' });
		}
	}
};
