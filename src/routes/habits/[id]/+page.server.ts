import { error, fail, redirect } from '@sveltejs/kit';
import { getPlanner } from '#lib/server/planner.js';
import { errorText, scheduleFromForm } from '../schedule.js';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ params }) => {
	const habit = getPlanner()
		.listHabits({ includeArchived: true })
		.find((h) => h.id === Number(params.id));
	if (!habit) error(404, 'Привычка не найдена');
	return { habit };
};

export const actions: Actions = {
	save: async ({ request, locals, params }) => {
		if (!locals.actor) throw new Error('Not authenticated');
		const form = await request.formData();
		try {
			getPlanner().updateHabit(locals.actor, Number(params.id), {
				title: String(form.get('title') ?? ''),
				schedule: scheduleFromForm(form)
			});
		} catch (e) {
			return fail(400, { error: errorText(e) });
		}
		redirect(303, '/habits');
	}
};
