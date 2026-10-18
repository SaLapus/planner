import { error } from '@sveltejs/kit';
import { getPlanner } from '#lib/server/planner.js';
import { addDays, dayLabel, toRow } from '../../format.js';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ params }) => {
	const { date } = params;
	if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date))) {
		error(404, 'Неверная дата');
	}
	const planner = getPlanner();
	return {
		date,
		label: dayLabel(date),
		prev: addDays(date, -1),
		next: addDays(date, 1),
		today: planner.today(),
		rows: planner.agenda(date, date).map(toRow)
	};
};
