// Calendar feed settings page, server half. `load` builds the secret subscription link; the
// `regenerate` action replaces the secret (the old link stops working at once).
import { getPlanner } from '#lib/server/planner.js';
import type { Actions, PageServerLoad } from './$types';
import { actorOf } from '#lib/server/request.js';

export const load: PageServerLoad = ({ url }) => {
	const planner = getPlanner();
	return { feedUrl: `${url.origin}/feed/${planner.feedSecret()}.ics`, today: planner.today() };
};

export const actions: Actions = {
	regenerate: ({ locals }) => {
		getPlanner().regenerateFeedSecret(actorOf(locals));
	}
};
