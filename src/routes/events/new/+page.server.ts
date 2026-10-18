import { fail, redirect } from '@sveltejs/kit';
import { getPlanner, HOME_TIME_ZONE } from '#lib/server/planner.js';
import { readEventForm, timeZoneChoices } from '../form.js';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ url }) => {
	// ?date=2026-01-10 (from the day view) pre-fills the start date.
	const date = url.searchParams.get('date') ?? getPlanner().today();
	return { date, zones: timeZoneChoices(), homeTimeZone: HOME_TIME_ZONE };
};

export const actions: Actions = {
	default: async ({ request, locals }) => {
		if (!locals.actor) throw new Error('Not authenticated');
		const input = readEventForm(await request.formData());
		let day: string;
		try {
			day = getPlanner().createEvent(locals.actor, input).startHome.slice(0, 10);
		} catch (e) {
			return fail(400, { error: e instanceof Error ? e.message : 'Ошибка', input });
		}
		redirect(303, `/events/day/${day}`);
	}
};
