import { error } from '@sveltejs/kit';
import { getPlanner } from '#lib/server/planner.js';
import { addDays, dayLabel, mondayOf, toRow, weekDays } from '../../format.js';
import type { PageServerLoad } from './$types';

// The week containing :date, Monday to Sunday. Any date in the week works as the address.
export const load: PageServerLoad = ({ params }) => {
	const { date } = params;
	if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date))) {
		error(404, 'Неверная дата');
	}
	const planner = getPlanner();
	const today = planner.today();
	const monday = mondayOf(date);
	const days = weekDays(date).map((d) => ({
		date: d,
		label: dayLabel(d),
		isToday: d === today,
		rows: planner.agenda(d, d).map(toRow)
	}));
	return {
		days,
		title: `${dayLabel(days[0].date).replace(/^[^,]+, /, '')} – ${dayLabel(days[6].date).replace(/^[^,]+, /, '')}`,
		prev: addDays(monday, -7),
		next: addDays(monday, 7),
		today
	};
};
