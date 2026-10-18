// Trash page, server half. `load` lists what is in Trash; the `restore` action puts one item back.
import { fail } from '@sveltejs/kit';
import { getPlanner } from '#lib/server/planner.js';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = () => {
	return { items: getPlanner().listTrash() };
};

export const actions: Actions = {
	restore: async ({ request, locals }) => {
		if (!locals.actor) throw new Error('Not authenticated');
		const form = await request.formData();
		try {
			getPlanner().restoreItem(locals.actor, String(form.get('type')), Number(form.get('id')));
		} catch (e) {
			return fail(400, { error: e instanceof Error ? e.message : 'Ошибка' });
		}
	}
};
