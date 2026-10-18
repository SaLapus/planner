// Server half of one Review. `load` reads the Review plus the period's data (so you can reflect with the
// numbers in front of you); `save` and `delete` translate form posts into core commands.
import { error, fail, redirect } from '@sveltejs/kit';
import { getPlanner } from '#lib/server/planner.js';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ params }) => {
	const planner = getPlanner();
	const id = Number(params.id);
	if (!planner.listReviews().some((r) => r.id === id)) error(404, 'Обзор не найден');
	const review = planner.getReview(id);
	return {
		review,
		data: planner.reviewData({ period: review.periodType, date: review.periodStart })
	};
};

export const actions: Actions = {
	save: async ({ request, locals, params }) => {
		if (!locals.actor) throw new Error('Not authenticated');
		const form = await request.formData();
		try {
			getPlanner().updateReview(locals.actor, Number(params.id), {
				draft: String(form.get('draft') ?? ''),
				reflection: String(form.get('reflection') ?? '')
			});
		} catch (e) {
			return fail(400, { error: e instanceof Error ? e.message : 'Ошибка' });
		}
		return { saved: true };
	},
	delete: async ({ locals, params }) => {
		if (!locals.actor) throw new Error('Not authenticated');
		getPlanner().deleteItem(locals.actor, 'review', Number(params.id)); // goes to /trash, can be restored
		redirect(303, '/reviews');
	}
};
