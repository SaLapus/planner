// Calendar feed settings page, server half. `load` builds the secret subscription link; the
// `regenerate` action replaces the secret (the old link stops working at once).
import { getPlanner } from '#lib/server/planner.js';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ url }) => {
	return { feedUrl: `${url.origin}/feed/${getPlanner().feedSecret()}.ics` };
};

export const actions: Actions = {
	regenerate: ({ locals }) => {
		if (!locals.actor) throw new Error('Not authenticated');
		getPlanner().regenerateFeedSecret(locals.actor);
	}
};
