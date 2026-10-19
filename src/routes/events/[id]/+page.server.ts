import { error, fail, redirect } from '@sveltejs/kit';
import { getPlanner } from '#lib/server/planner.js';
import { timeZoneChoices } from '../form.js';
import { saveEvent } from '../save.js';
import type { Actions, PageServerLoad } from './$types';
import { actorOf, errorText } from '#lib/server/request.js';

function idOf(raw: string): number {
	const id = Number(raw);
	if (!Number.isInteger(id)) error(404, 'Событие не найдено');
	return id;
}

// /events/12?occ=2026-03-30T09:00 opens one occurrence of a recurring Event.
export const load: PageServerLoad = ({ params, url }) => {
	try {
		const planner = getPlanner();
		const event = planner.getEvent(idOf(params.id));
		// For a recurring Event we always show one occurrence (the first, if none was chosen).
		const occ = event.recurrence ? (url.searchParams.get('occ') ?? (event.allDay ? event.start : event.startLocal)) : '';
		const shown = occ ? planner.getOccurrence(event.id, occ) : event;
		return { event, occ, shown, zones: timeZoneChoices() };
	} catch {
		error(404, 'Событие не найдено');
	}
};

export const actions: Actions = {
	save: async ({ request, locals, params }) => {
		let day: string;
		try {
			day = saveEvent(getPlanner(), actorOf(locals), idOf(params.id), await request.formData()).startHome.slice(0, 10);
		} catch (e) {
			return fail(400, { error: errorText(e) });
		}
		redirect(303, `/events/day/${day}`);
	},
	cancelOccurrence: async ({ request, locals, params }) => {
		const occ = String((await request.formData()).get('occ') ?? '');
		let day: string;
		try {
			const planner = getPlanner();
			const id = idOf(params.id);
			day = planner.getOccurrence(id, occ).startHome.slice(0, 10);
			planner.cancelOccurrence(actorOf(locals), id, occ);
		} catch (e) {
			return fail(400, { error: errorText(e) });
		}
		redirect(303, `/events/day/${day}`);
	},
	delete: async ({ locals, params }) => {
		let day: string;
		try {
			const planner = getPlanner();
			const id = idOf(params.id);
			day = planner.getEvent(id).startHome.slice(0, 10);
			planner.deleteItem(actorOf(locals), 'event', id);
		} catch (e) {
			return fail(400, { error: errorText(e) });
		}
		redirect(303, `/events/day/${day}`);
	}
};
