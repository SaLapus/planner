// Turns a posted <form> into the core's EventInput. Kept apart from the pages so "new" and
// "edit" read the form the same way. No rules here: the core validates.
import type { EventInput } from '#lib/core/index.js';
import { HOME_TIME_ZONE } from '#lib/server/planner.js';

export function readEventForm(form: FormData): EventInput {
	const text = (name: string) => String(form.get(name) ?? '').trim();
	const end = text('end');
	return {
		title: text('title'),
		notes: String(form.get('notes') ?? ''),
		location: text('location'),
		allDay: form.get('allDay') === 'on',
		timeZone: text('timeZone') || HOME_TIME_ZONE,
		start: text('start'),
		end: end || undefined
	};
}

export const timeZoneChoices = (): string[] => Intl.supportedValuesOf('timeZone');
