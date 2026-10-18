// Server half of the habits page: `load` prepares the data, `actions` handle the form posts.
// No habit rules live here - the core decides; this file only translates forms and errors.
import { fail, type Action } from '@sveltejs/kit';
import { getPlanner } from '#lib/server/planner.js';
import type { Actor } from '#lib/core/index.js';
import { errorText, scheduleFromForm } from './schedule.js';
import type { Actions, PageServerLoad } from './$types';

function actorOf(locals: App.Locals): Actor {
	if (!locals.actor) throw new Error('Not authenticated');
	return locals.actor;
}

const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

export const load: PageServerLoad = () => {
	const planner = getPlanner();
	const status = planner.habitStatus({});
	const today = Temporal.PlainDate.from(status.date);
	// The last 7 local days (oldest first), so a forgotten check-in is one tap away.
	const dates = Array.from({ length: 7 }, (_, i) => today.subtract({ days: 6 - i }));

	const habits = status.habits.map((s) => {
		const checked = new Set(
			planner.listCheckinDates(s.habit.id, { from: dates[0].toString(), to: today.toString() })
		);
		return {
			...s,
			days: dates.map((d) => ({
				date: d.toString(),
				label: WEEKDAYS[d.dayOfWeek - 1],
				num: d.day,
				checked: checked.has(d.toString())
			}))
		};
	});

	const all = planner.listHabits({ includeArchived: true });
	const titles = new Map(all.map((h) => [h.id, h.title]));
	return {
		habits,
		archived: all.filter((h) => h.archivedAt !== null),
		trashHabits: planner.listDeletedHabits(),
		trashCheckins: planner
			.listDeletedCheckins()
			.map((c) => ({ ...c, habitTitle: titles.get(c.habitId) ?? `#${c.habitId}` }))
	};
};

const run =
	(fn: (form: FormData, actor: Actor) => void): Action =>
	async ({ request, locals }) => {
		try {
			fn(await request.formData(), actorOf(locals));
		} catch (e) {
			return fail(400, { error: errorText(e) });
		}
	};

export const actions: Actions = {
	create: run((form, actor) => {
		getPlanner().createHabit(actor, {
			title: String(form.get('title') ?? ''),
			schedule: scheduleFromForm(form)
		});
	}),
	// Toggles one day: `on=true` adds the check-in, otherwise removes it.
	checkin: run((form, actor) => {
		const id = Number(form.get('id'));
		const date = String(form.get('date'));
		if (form.get('on') === 'true') getPlanner().addCheckin(actor, id, { date });
		else getPlanner().removeCheckin(actor, id, { date });
	}),
	archive: run((form, actor) => void getPlanner().archiveHabit(actor, Number(form.get('id')))),
	unarchive: run((form, actor) => void getPlanner().unarchiveHabit(actor, Number(form.get('id')))),
	delete: run((form, actor) => void getPlanner().deleteHabit(actor, Number(form.get('id')))),
	restoreHabit: run((form, actor) => void getPlanner().restoreHabit(actor, Number(form.get('id')))),
	restoreCheckin: run((form, actor) => void getPlanner().restoreCheckin(actor, Number(form.get('id'))))
};
