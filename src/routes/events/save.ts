// Saving the Event edit form. The form shows ONE occurrence of a recurring Event (the one the
// user clicked, `occ`) and a choice of scope: only this one, this and following, or the whole
// series. This turns "what the form says" into the right core command, sending only what the
// user actually changed so that untouched things (other occurrences' edits, the rule's COUNT)
// stay as they were.
import type { Actor, Event, EventInput, Planner } from '#lib/core/index.js';
import { readEventForm } from './form.js';

export function saveEvent(planner: Planner, actor: Actor, id: number, form: FormData): Event {
	const input = readEventForm(form);
	const occ = String(form.get('occ') ?? '');
	const scope = String(form.get('scope') ?? 'all');
	const series = planner.getEvent(id);
	if (!series.recurrence || !occ) return planner.updateEvent(actor, id, input);

	const o = planner.getOccurrence(id, occ);
	const startChanged = input.start !== o.startLocal;
	const endChanged = input.end !== undefined && input.end !== o.endLocal;
	const changed: Partial<EventInput> = {};
	if (input.title !== o.title) changed.title = input.title;
	if (input.notes !== o.notes) changed.notes = input.notes;
	if (input.location !== o.location) changed.location = input.location;

	if (scope === 'this') {
		if (startChanged) changed.start = input.start;
		if (endChanged) changed.end = input.end;
		return planner.updateEventScoped(actor, id, { recurrenceId: occ, scope: 'this' }, changed);
	}

	if (input.recurrence !== undefined && input.recurrence !== series.recurrence) {
		changed.recurrence = input.recurrence;
	}
	if (input.timeZone !== series.timeZone) changed.timeZone = input.timeZone;
	const flipped = input.allDay !== series.allDay;
	if (flipped) changed.allDay = input.allDay;

	if (scope === 'following') {
		if (startChanged || flipped) changed.start = input.start;
		if (endChanged || flipped) changed.end = input.end;
		return planner.updateEventScoped(actor, id, { recurrenceId: occ, scope: 'following' }, changed);
	}

	// Whole series: the form shows one occurrence, so a changed time is a SHIFT to apply to the
	// first occurrence, and a changed end a new length.
	if (flipped) {
		changed.start = input.start;
		changed.end = input.end;
	} else if (startChanged || endChanged) {
		const pdt = (s: string) => Temporal.PlainDateTime.from(series.allDay ? `${s}T00:00` : s);
		const shift = pdt(input.start).since(pdt(o.startLocal));
		const first = pdt(series.startLocal).add(shift);
		const length = input.end ? pdt(input.end).since(pdt(input.start)) : pdt(o.endLocal).since(pdt(o.startLocal));
		const text = (d: Temporal.PlainDateTime) =>
			series.allDay ? d.toString().slice(0, 10) : d.toString({ smallestUnit: 'minute' });
		changed.start = text(first);
		changed.end = text(first.add(length));
	}
	return planner.updateEventScoped(actor, id, { scope: 'all' }, changed);
}
