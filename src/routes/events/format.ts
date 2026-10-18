// Russian display helpers for Events. Pure functions, no Svelte: the loaders call them on the
// server and hand ready-made strings to the pages, so the browser needs no time-zone maths.
import type { AgendaItem } from '#lib/core/index.js';

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
export function whenLabel(e: AgendaItem): string {
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
export function zoneNote(e: AgendaItem): string {
	if (e.allDay || e.startLocal === e.startHome) return '';
	return `${e.timeZone}, у вас ${time(e.startHome)}`;
}

/** Everything the list pages need to draw one row. */
export function toRow(e: AgendaItem) {
	return {
		id: e.id,
		title: e.title,
		location: e.location,
		notes: e.notes,
		when: whenLabel(e),
		zone: zoneNote(e),
		allDay: e.allDay
	};
}
export type EventRow = ReturnType<typeof toRow>;
