import { z } from 'zod';
import { reply, type RegisterTools } from './support.js';

const TIME_HELP =
	'Timed Events: an ISO datetime with Z/offset (absolute) or a wall-clock time like "2026-03-30T10:00" read in the Event\'s own time zone (Home zone unless timeZone is given). All-day Events: a date "YYYY-MM-DD".';

const RECURRENCE_HELP =
	'Makes the Event repeat: an RFC 5545 RRULE value such as "FREQ=DAILY", "FREQ=WEEKLY;BYDAY=MO,WE,FR", "FREQ=MONTHLY;INTERVAL=2;COUNT=6" or "FREQ=YEARLY;UNTIL=2027-12-31" (DAILY/WEEKLY/MONTHLY/YEARLY, INTERVAL, BYDAY, BYMONTHDAY, BYMONTH, COUNT or UNTIL as an inclusive local date). The start is the first occurrence; its wall-clock time stays the same across daylight saving.';

export const registerEventTools: RegisterTools = (server, { planner, actor }) => {
	server.registerTool(
		'create_event',
		{
			description: `Create a calendar Event. ${TIME_HELP} For an all-day Event set allDay=true and give dates; end is the LAST day, inclusive (defaults to start). A timed Event without end lasts one hour. Text is stored exactly as given, in any language. Returns the new Event.`,
			inputSchema: z.object({
				title: z.string(),
				start: z.string().describe('Start datetime, or date when allDay'),
				end: z.string().optional().describe('End datetime, or last date when allDay'),
				allDay: z.boolean().optional(),
				timeZone: z
					.string()
					.optional()
					.describe('IANA zone, e.g. Europe/Kyiv. Defaults to the Home zone'),
				notes: z.string().optional(),
				location: z.string().optional(),
				recurrence: z.string().optional().describe(RECURRENCE_HELP)
			})
		},
		reply((input) => planner.createEvent(actor, input))
	);

	server.registerTool(
		'update_event',
		{
			description: `Change an Event; only the given fields change. ${TIME_HELP} Switching allDay requires a new start. For a recurring Event (get_agenda items carry a recurrenceId), pass recurrenceId to change just that occurrence (scope "this", the default) or that occurrence and all after it (scope "following": the series is split and the NEW series is returned). Without recurrenceId the whole series changes (and its single-occurrence changes are dropped if start, time zone or recurrence change). In scope "this" only title, notes, location, start and end can change; moving an occurrence keeps its length unless end is given.`,
			inputSchema: z.object({
				id: z.number().int().describe('Event id from get_agenda'),
				recurrenceId: z
					.string()
					.optional()
					.describe('Occurrence to change: the recurrenceId from get_agenda, e.g. "2026-03-30T09:00"'),
				scope: z
					.enum(['this', 'following', 'all'])
					.optional()
					.describe('With recurrenceId: "this" (default) or "following". "all" = whole series, give no recurrenceId'),
				title: z.string().optional(),
				start: z.string().optional(),
				end: z.string().optional(),
				allDay: z.boolean().optional(),
				timeZone: z.string().optional(),
				notes: z.string().optional(),
				location: z.string().optional(),
				recurrence: z
					.string()
					.nullable()
					.optional()
					.describe(`${RECURRENCE_HELP} null makes a recurring Event one-off.`)
			})
		},
		reply(({ id, recurrenceId, scope, ...patch }) =>
			planner.updateEventScoped(actor, id, { recurrenceId, scope }, patch)
		)
	);

	server.registerTool(
		'cancel_occurrence',
		{
			description:
				'Skip ONE occurrence of a recurring Event (the rest of the series is untouched). Use the id and recurrenceId of an item from get_agenda. To end the series from some date on, use update_event with scope "following" and a recurrence, or delete_item for the whole series. Undo with undo_change.',
			inputSchema: z.object({
				id: z.number().int().describe('Event id from get_agenda'),
				recurrenceId: z.string().describe('The occurrence, as given by get_agenda, e.g. "2026-03-30T09:00"')
			})
		},
		reply(({ id, recurrenceId }) => planner.cancelOccurrence(actor, id, recurrenceId))
	);

	server.registerTool(
		'search_events',
		{
			description:
				'Find calendar Events by text (title, notes or location, case-insensitive) and/or a date range. Without from/to each matching Event is returned once (a recurring one as its series, recurrenceId null). With from AND to (same formats as get_agenda: dates are Home-zone days, to inclusive) the matching occurrences inside the range are returned, recurring Events expanded, as get_agenda items. Needs text or a range.',
			inputSchema: z.object({
				text: z.string().optional(),
				from: z.string().optional().describe('Range start: date or datetime (give together with to)'),
				to: z.string().optional().describe('Range end: date (inclusive) or datetime (exclusive)')
			})
		},
		reply((input) => planner.searchEvents(input))
	);

	server.registerTool(
		'get_agenda',
		{
			description:
				'List what is scheduled in a date range, ordered by start (all-day entries first on their day), as items with a "kind" field: "event" (a calendar Event; recurring Events are expanded, each occurrence being its own item with the series id and a recurrenceId to pass to update_event or cancel_occurrence, null for one-off Events), or "task" (a to-do) with a "placement": "time_block" (a Task with a Time block, spanning the block) or "due" (an open Task with a due date and no Time block: all-day entry, or a point at its due time). A Task that is both due and time-blocked appears once, as "time_block". Completed Tasks are not listed. Each item has start/end in UTC (timed) or dates (all-day) and startHome/endHome in the Home time zone; Events also have startLocal/endLocal in their own time zone. If from/to are dates (YYYY-MM-DD) they are Home-zone days and to is INCLUSIVE: from=to="2026-03-30" is that whole day. A datetime with Z/offset is an instant; without offset it is Home wall-clock time and to is exclusive.',
			inputSchema: z.object({
				from: z.string().describe('Range start: date or datetime'),
				to: z.string().describe('Range end: date (inclusive) or datetime (exclusive)')
			})
		},
		reply(({ from, to }) => planner.agenda(from, to))
	);
};
