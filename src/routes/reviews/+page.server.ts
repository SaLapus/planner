// Server half of the Reviews list. `load` reads the past Reviews; `start` creates the Review of the
// current week/month (empty) and opens it. No Review rules live here - the core decides.
import { fail, redirect } from '@sveltejs/kit';
import { getPlanner } from '#lib/server/planner.js';
import type { Actions, PageServerLoad } from './$types';
import { actorOf, errorText } from '#lib/server/request.js';

export const load: PageServerLoad = () => {
	const planner = getPlanner();
	return {
		reviews: planner.listReviews(),
		// So the page can offer "open" instead of "start" when the current week/month already has one.
		current: {
			week: planner.reviewData({ period: 'week' }).review,
			month: planner.reviewData({ period: 'month' }).review
		}
	};
};

export const actions: Actions = {
	start: async ({ request, locals }) => {
		const form = await request.formData();
		const period = form.get('period') === 'month' ? 'month' : 'week';
		let id: number;
		try {
			const planner = getPlanner();
			id = (planner.reviewData({ period }).review ?? planner.createReview(actorOf(locals), { period })).id;
		} catch (e) {
			return fail(400, { error: errorText(e) });
		}
		redirect(303, `/reviews/${id}`);
	}
};
