// Server half of the goals list: `load` prepares the data, the `create` action handles the form post.
// No goal rules live here - the core decides.
import { fail } from '@sveltejs/kit';
import { getPlanner } from '#lib/server/planner.js';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = () => {
	const planner = getPlanner();
	// One call gives progress for every goal; inactive ones (paused/achieved/dropped) are listed separately.
	const all = planner.goalProgress({ includeInactive: true });
	return {
		active: all.filter((p) => p.goal.status === 'active'),
		other: all.filter((p) => p.goal.status !== 'active')
	};
};

export const actions: Actions = {
	create: async ({ request, locals }) => {
		if (!locals.actor) throw new Error('Not authenticated');
		const form = await request.formData();
		try {
			getPlanner().createGoal(locals.actor, {
				title: String(form.get('title') ?? ''),
				description: String(form.get('description') ?? ''),
				targetDate: String(form.get('targetDate') ?? '') || null
			});
		} catch (e) {
			return fail(400, { error: e instanceof Error ? e.message : 'Ошибка' });
		}
	}
};
