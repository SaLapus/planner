// Trash page, server half. `load` lists what is in Trash; the `restore` action puts one item back.
import { fail } from '@sveltejs/kit';
import { getPlanner } from '#lib/server/planner.js';
import type { Actions, PageServerLoad } from './$types';
import { actorOf, errorText } from '#lib/server/request.js';

export const load: PageServerLoad = () => {
	return { items: getPlanner().listTrash() };
};

export const actions: Actions = {
	restore: async ({ request, locals }) => {
		const form = await request.formData();
		try {
			getPlanner().restoreItem(actorOf(locals), String(form.get('type')), Number(form.get('id')));
		} catch (e) {
			return fail(400, { error: errorText(e) });
		}
	}
};
