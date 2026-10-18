// Change log page, server half. The actor filter lives in the URL (?actor=claude), so it can be
// bookmarked and works without JavaScript. `undo` calls the core, which refuses with a reason on conflict.
import { fail } from '@sveltejs/kit';
import { getPlanner } from '#lib/server/planner.js';
import type { Actions, PageServerLoad } from './$types';

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
		if (!locals.actor) throw new Error('Not authenticated');
		const id = Number((await request.formData()).get('id'));
		try {
			getPlanner().undoChange(locals.actor, id);
		} catch (e) {
			return fail(400, { error: e instanceof Error ? e.message : 'Ошибка' });
		}
	}
};
