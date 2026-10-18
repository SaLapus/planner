// Change log page, server half. The actor filter lives in the URL (?actor=claude), so it can be
// bookmarked and works without JavaScript. `undo` calls the core, which refuses with a reason on conflict.
import { fail } from '@sveltejs/kit';
import { getPlanner } from '#lib/server/planner.js';
import type { Actions, PageServerLoad } from './$types';
import { actorOf, errorText } from '#lib/server/request.js';

export const load: PageServerLoad = ({ url }) => {
	const param = url.searchParams.get('actor');
	const actor = param === 'owner' || param === 'claude' ? param : null;
	const planner = getPlanner();
	const entries = planner
		.changeLog(actor ? { actor } : undefined)
		.reverse() // newest first
		.slice(0, 100)
		.map((e) => ({ ...e, blockedReason: planner.undoBlockedReason(e.id) }));
	return { actor, entries };
};

export const actions: Actions = {
	undo: async ({ request, locals }) => {
		const id = Number((await request.formData()).get('id'));
		try {
			getPlanner().undoChange(actorOf(locals), id);
		} catch (e) {
			return fail(400, { error: errorText(e) });
		}
	}
};
