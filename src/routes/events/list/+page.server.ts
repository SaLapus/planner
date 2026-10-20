// Agenda: the next two weeks, grouped by day (Home time zone). An Event that spans several
// days appears under each of them.
import { getPlanner } from '#lib/server/planner.js';
import { addDays, dayLabel, toRow } from '../format.js';
import type { PageServerLoad } from './$types';

const DAYS = 14;

export const load: PageServerLoad = () => {
	const planner = getPlanner();
	const today = planner.today();
	const days = [];
	for (let i = 0; i < DAYS; i++) {
		const date = addDays(today, i);
		const rows = planner.agenda(date, date).map(toRow);
		if (rows.length > 0 || i === 0) days.push({ date, label: dayLabel(date), isToday: i === 0, rows });
	}
	return { today, days };
};
