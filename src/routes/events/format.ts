// Russian display helpers for Events. Pure functions, no Svelte: the loaders call them on the
// server and hand ready-made strings to the pages, so the browser needs no time-zone maths.
import type { AgendaItem, EventAgendaItem, TaskAgendaItem } from '#lib/core/index.js';

const dayFmt = new Intl.DateTimeFormat('ru', {
	weekday: 'long',
	day: 'numeric',
	month: 'long',
	timeZone: 'UTC' // the date is already a plain calendar date; UTC just stops any shifting
});
const shortFmt = new Intl.DateTimeFormat('ru', { day: 'numeric', month: 'short', timeZone: 'UTC' });

const asUtc = (date: string) => new Date(`${date}T00:00:00Z`);

/** "понедельник, 5 января" */
export const dayLabel = (date: string) => dayFmt.format(asUtc(date));

/** Add `n` days to a "YYYY-MM-DD" date. */
export function addDays(date: string, n: number): string {
	const d = asUtc(date);
	d.setUTCDate(d.getUTCDate() + n);
	return d.toISOString().slice(0, 10);
}

const time = (local: string) => local.slice(11, 16);
const datePart = (local: string) => local.slice(0, 10);

/** When the item happens, in the Event's own local time, e.g. "10:00–11:30". */
export function whenLabel(e: EventAgendaItem): string {
	if (e.allDay) {
		return e.start === e.end
			? 'Весь день'
			: `Весь день, ${shortFmt.format(asUtc(e.start))} – ${shortFmt.format(asUtc(e.end))}`;
	}
	if (datePart(e.startLocal) === datePart(e.endLocal)) {
		return `${time(e.startLocal)}–${time(e.endLocal)}`;
	}
	return `${shortFmt.format(asUtc(datePart(e.startLocal)))} ${time(e.startLocal)} – ${shortFmt.format(asUtc(datePart(e.endLocal)))} ${time(e.endLocal)}`;
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
	return `${shortFmt.format(asUtc(datePart(t.startHome)))} ${time(t.startHome)} – ${shortFmt.format(asUtc(datePart(t.endHome)))} ${time(t.endHome)}`;
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
			timeBlock: item.placement === 'time_block'
		};
	}
	return {
		key: `event-${item.id}`,
		kind: 'event' as const,
		id: item.id,
		title: item.title,
		location: item.location,
		notes: item.notes,
		when: whenLabel(item),
		zone: zoneNote(item),
		allDay: item.allDay,
		href: `/events/${item.id}`,
		timeBlock: false
	};
}
export type EventRow = ReturnType<typeof toRow>;

/** The Monday of the week containing `date` (weeks start on Monday). */
export function mondayOf(date: string): string {
	const sundayFirst = asUtc(date).getUTCDay(); // 0 = Sunday ... 6 = Saturday
	return addDays(date, -((sundayFirst + 6) % 7));
}

/** The seven dates, Monday to Sunday, of the week containing `date`. */
export function weekDays(date: string): string[] {
	const monday = mondayOf(date);
	return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}
