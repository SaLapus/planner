// Russian display helpers for Events. Pure functions, no Svelte: the loaders call them on the
// server and hand ready-made strings to the pages, so the browser needs no time-zone maths.
import type { AgendaItem, EventAgendaItem, TaskAgendaItem } from '#lib/core/index.js';

const dayFmt = new Intl.DateTimeFormat('ru', {
	weekday: 'long',
	day: 'numeric',
	month: 'long'
});
const shortFmt = new Intl.DateTimeFormat('ru', { day: 'numeric', month: 'short' });

// A calendar date has no time zone: Temporal.PlainDate, never a Date at UTC midnight.
const plain = (date: string) => Temporal.PlainDate.from(date);

/** "понедельник, 5 января" */
export const dayLabel = (date: string) => dayFmt.format(plain(date));

/** Add `n` days to a "YYYY-MM-DD" date. */
export function addDays(date: string, n: number): string {
	return plain(date).add({ days: n }).toString();
}

const time = (local: string) => local.slice(11, 16);
const datePart = (local: string) => local.slice(0, 10);

/** When the item happens, in the Event's own local time, e.g. "10:00–11:30". */
export function whenLabel(e: EventAgendaItem): string {
	if (e.allDay) {
		return e.start === e.end
			? 'Весь день'
			: `Весь день, ${shortFmt.format(plain(e.start))} – ${shortFmt.format(plain(e.end))}`;
	}
	if (datePart(e.startLocal) === datePart(e.endLocal)) {
		return `${time(e.startLocal)}–${time(e.endLocal)}`;
	}
	return `${shortFmt.format(plain(datePart(e.startLocal)))} ${time(e.startLocal)} – ${shortFmt.format(plain(datePart(e.endLocal)))} ${time(e.endLocal)}`;
}

/** For an Event in another zone: "Europe/Kyiv, у вас 10:30". Empty when it matches Home time. */
export function zoneNote(e: EventAgendaItem): string {
	if (e.allDay || e.startLocal === e.startHome) return '';
	return `${e.timeZone}, у вас ${time(e.startHome)}`;
}

/** When a Task happens: its Time block ("09:00–10:30") or its due moment ("Срок: 17:30"). */
export function taskWhenLabel(t: TaskAgendaItem): string {
	if (t.placement === 'due') return t.allDay ? 'Срок: весь день' : `Срок: ${time(t.startHome)}`;
	if (datePart(t.startHome) === datePart(t.endHome)) return `${time(t.startHome)}–${time(t.endHome)}`;
	return `${shortFmt.format(plain(datePart(t.startHome)))} ${time(t.startHome)} – ${shortFmt.format(plain(datePart(t.endHome)))} ${time(t.endHome)}`;
}

/**
 * Everything the list pages need to draw one row, for an Event or a Task alike.
 * `kind` lets the page style them differently; `key` is unique across both
 * (an Event and a Task may share the same numeric id).
 */
export function toRow(item: AgendaItem) {
	if (item.kind === 'task') {
		return {
			key: `task-${item.id}`,
			kind: 'task' as const,
			id: item.id,
			title: item.title,
			location: '',
			notes: '',
			when: taskWhenLabel(item),
			zone: '',
			allDay: item.allDay,
			href: `/#task-${item.id}`,
			repeats: false,
			timeBlock: item.placement === 'time_block'
		};
	}
	return {
		// Every occurrence of a repeating Event has the same id, so the key adds the occurrence.
		key: `event-${item.id}/${item.recurrenceId ?? ''}`,
		kind: 'event' as const,
		id: item.id,
		title: item.title,
		location: item.location,
		notes: item.notes,
		when: whenLabel(item),
		zone: zoneNote(item),
		allDay: item.allDay,
		// A repeating Event's link carries the occurrence, so the edit page knows which one was clicked.
		href: item.recurrenceId
			? `/events/${item.id}?occ=${encodeURIComponent(item.recurrenceId)}`
			: `/events/${item.id}`,
		repeats: item.recurrence !== null,
		timeBlock: false
	};
}
export type EventRow = ReturnType<typeof toRow>;

/** The Monday of the week containing `date` (weeks start on Monday). */
export function mondayOf(date: string): string {
	return plain(date).subtract({ days: plain(date).dayOfWeek - 1 }).toString(); // dayOfWeek: 1 = Monday
}

/** The seven dates, Monday to Sunday, of the week containing `date`. */
export function weekDays(date: string): string[] {
	const monday = mondayOf(date);
	return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}
