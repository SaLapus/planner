/**
 * The agenda: everything scheduled in a date range, from several SOURCES merged into one list.
 *
 * Each source is a function `(range) => items`; the agenda concatenates them and sorts. To add a
 * source (or change one, e.g. recurring Events expanding inside the Event source), you only touch
 * that source: the merge below never looks inside an item beyond its `start` and `kind`.
 *
 * Sources today:
 *  - Events (events.ts, passed in by index.ts), `kind: 'event'`;
 *  - Tasks (here), `kind: 'task'` with `placement`:
 *      'time_block' a Task with a Time block, spanning the block;
 *      'due'        an open Task with a due date but NO Time block: an all-day entry on its due
 *                   date, or a point at its due time. A Task that is both due and time-blocked
 *                   appears once, as its time block (the Task itself still carries `dueDate`).
 *    Completed Tasks are not scheduled.
 */
import type { CoreContext } from './context.js';
import type { EventAgendaItem } from './events.js';
import { readTask, type Task } from './tasks.js';

export type TaskAgendaItem = Task & {
	kind: 'task';
	placement: 'time_block' | 'due';
	allDay: boolean;
	/** Time block / due time: UTC instant. Due without a time: the local Home date. */
	start: string;
	/** Same formats; equal to `start` for a due Task. */
	end: string;
	/** Wall clock in the Home zone ("2026-03-30T09:00"); for an all-day entry the date. */
	startHome: string;
	endHome: string;
};

/** One entry of the agenda. Tell the kinds apart by `kind` (and Tasks by `placement`). */
export type AgendaItem = EventAgendaItem | TaskAgendaItem;

export interface AgendaApi {
	/**
	 * Everything overlapping [from, to), ordered by start (all-day entries first on their day), then
	 * Events before Tasks, then id. `from`/`to` are ISO strings: date-only means a local Home date
	 * (`to` as a date is INCLUSIVE, so from=to="2026-01-05" is that whole day); a datetime with
	 * Z/offset is an instant; a datetime without offset is Home wall clock (and `to` is exclusive).
	 */
	agenda(from: string, to: string): AgendaItem[];
}

/** Epoch-millisecond range [lo, hi). */
interface Range {
	lo: number;
	hi: number;
}

type Source = (range: Range) => AgendaItem[];

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const HAS_OFFSET = /(Z|[+-]\d{2}(:?\d{2})?)$/i;

export function agendaModule(
	{ db, homeTimeZone }: CoreContext,
	eventSource: (from: string, to: string) => EventAgendaItem[]
): AgendaApi {
	const dayStart = (d: Temporal.PlainDate) => d.toZonedDateTime(homeTimeZone).epochMilliseconds;
	const bound = (s: string, isEnd: boolean) => {
		try {
			if (DATE_ONLY.test(s)) {
				const d = Temporal.PlainDate.from(s);
				return dayStart(isEnd ? d.add({ days: 1 }) : d);
			}
			return (
				HAS_OFFSET.test(s)
					? Temporal.Instant.from(s)
					: Temporal.PlainDateTime.from(s).toZonedDateTime(homeTimeZone).toInstant()
			).epochMilliseconds;
		} catch {
			throw new Error(`Invalid agenda range bound "${s}" (use YYYY-MM-DD or YYYY-MM-DDTHH:MM)`);
		}
	};
	const wall = (i: Temporal.Instant) =>
		i.toZonedDateTimeISO(homeTimeZone).toPlainDateTime().toString({ smallestUnit: 'minute' });

	/** Epoch ms where an item starts (all-day entries at the start of their Home day). */
	const startMs = (i: AgendaItem) =>
		i.allDay ? dayStart(Temporal.PlainDate.from(i.start)) : Temporal.Instant.from(i.start).epochMilliseconds;

	const taskSource: Source = ({ lo, hi }) => {
		const ids = db
			.prepare(
				`SELECT id FROM task WHERE completed_at IS NULL AND (block_start IS NOT NULL OR due_date IS NOT NULL) ORDER BY id`
			)
			.all() as { id: number }[];
		const items: AgendaItem[] = [];
		for (const { id } of ids) {
			const task = readTask(db, id);
			let item: TaskAgendaItem;
			let s: number;
			let e: number;
			if (task.timeBlock) {
				const start = Temporal.Instant.from(task.timeBlock.start);
				const end = start.add({ minutes: task.timeBlock.minutes });
				[s, e] = [start.epochMilliseconds, end.epochMilliseconds];
				item = {
					...task,
					kind: 'task',
					placement: 'time_block',
					allDay: false,
					start: start.toString(),
					end: end.toString(),
					startHome: wall(start),
					endHome: wall(end)
				};
			} else if (task.dueTime) {
				const at = Temporal.PlainDateTime.from(`${task.dueDate}T${task.dueTime}`)
					.toZonedDateTime(homeTimeZone)
					.toInstant();
				[s, e] = [at.epochMilliseconds, at.epochMilliseconds];
				item = {
					...task,
					kind: 'task',
					placement: 'due',
					allDay: false,
					start: at.toString(),
					end: at.toString(),
					startHome: wall(at),
					endHome: wall(at)
				};
			} else {
				const day = Temporal.PlainDate.from(task.dueDate!);
				[s, e] = [dayStart(day), dayStart(day.add({ days: 1 }))];
				item = {
					...task,
					kind: 'task',
					placement: 'due',
					allDay: true,
					start: task.dueDate!,
					end: task.dueDate!,
					startHome: task.dueDate!,
					endHome: task.dueDate!
				};
			}
			// Same overlap rule as Events: spans overlap [lo, hi); a point counts when inside it.
			if (s < hi && (e > lo || (e === s && s >= lo))) items.push(item);
		}
		return items;
	};

	return {
		agenda(from, to) {
			const lo = bound(from, false);
			const hi = bound(to, true);
			if (hi < lo || (DATE_ONLY.test(to) && hi === lo)) throw new Error('Agenda range end is before its start');
			const sources: Source[] = [() => eventSource(from, to), taskSource];
			// Array.sort is stable, so source order (Events first) and each source's own order break ties.
			return sources
				.flatMap((source) => source({ lo, hi }))
				.map((item) => ({ item, at: startMs(item) }))
				.sort((a, b) => a.at - b.at)
				.map(({ item }) => item);
		}
	};
}
