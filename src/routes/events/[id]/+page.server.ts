import { error, fail, redirect } from '@sveltejs/kit';
import { getPlanner } from '#lib/server/planner.js';
import { readEventForm, timeZoneChoices } from '../form.js';
import type { Actions, PageServerLoad } from './$types';

function idOf(raw: string): number {
	const id = Number(raw);
	if (!Number.isInteger(id)) error(404, 'Событие не найдено');
	return id;
}

export const load: PageServerLoad = ({ params }) => {
	try {
		return { event: getPlanner().getEvent(idOf(params.id)), zones: timeZoneChoices() };
	} catch {
		error(404, 'Событие не найдено');
	}
};

export const actions: Actions = {
	save: async ({ request, locals, params }) => {
		if (!locals.actor) throw new Error('Not authenticated');
		const input = readEventForm(await request.formData());
		let day: string;
		try {
			day = getPlanner().updateEvent(locals.actor, idOf(params.id), input).startHome.slice(0, 10);
		} catch (e) {
			return fail(400, { error: e instanceof Error ? e.message : 'Ошибка', input });
		}
		redirect(303, `/events/day/${day}`);
	},
	delete: async ({ locals, params }) => {
		if (!locals.actor) throw new Error('Not authenticated');
		let day: string;
		try {
			day = getPlanner().deleteEvent(locals.actor, idOf(params.id)).startHome.slice(0, 10);
		} catch (e) {
			return fail(400, { error: e instanceof Error ? e.message : 'Ошибка' });
		}
		redirect(303, `/events/day/${day}`);
	}
};
