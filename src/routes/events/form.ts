// Turns a posted <form> into the core's EventInput. Kept apart from the pages so "new" and
// "edit" read the form the same way. No rules here: the core validates.
import type { EventInput } from '#lib/core/index.js';
import { HOME_TIME_ZONE } from '#lib/server/planner.js';

export function readEventForm(form: FormData): EventInput {
	const text = (name: string) => String(form.get(name) ?? '').trim();
	const end = text('end');
	// The recurrence editor posts the rule, or an empty string for "does not repeat". A form
	// without the field (editing a single occurrence) leaves the rule alone.
	const recurrence = form.has('recurrence') ? text('recurrence') || null : undefined;
	return {
		title: text('title'),
		notes: String(form.get('notes') ?? ''),
		location: text('location'),
		allDay: form.get('allDay') === 'on',
		timeZone: text('timeZone') || HOME_TIME_ZONE,
		start: text('start'),
		end: end || undefined,
		recurrence
	};
}

export const timeZoneChoices = (): string[] => Intl.supportedValuesOf('timeZone');
