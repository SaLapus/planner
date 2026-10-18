import { z } from 'zod';
import { reply, type RegisterTools } from './support.js';

const TIME_HELP =
	'Timed Events: an ISO datetime with Z/offset (absolute) or a wall-clock time like "2026-03-30T10:00" read in the Event\'s own time zone (Home zone unless timeZone is given). All-day Events: a date "YYYY-MM-DD".';

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
				location: z.string().optional()
			})
		},
		reply((input) => planner.createEvent(actor, input))
	);

	server.registerTool(
		'update_event',
		{
			description: `Change an Event; only the given fields change. ${TIME_HELP} Switching allDay requires a new start.`,
			inputSchema: z.object({
				id: z.number().int().describe('Event id from get_agenda'),
				title: z.string().optional(),
				start: z.string().optional(),
				end: z.string().optional(),
				allDay: z.boolean().optional(),
				timeZone: z.string().optional(),
				notes: z.string().optional(),
				location: z.string().optional()
			})
		},
		reply(({ id, ...patch }) => planner.updateEvent(actor, id, patch))
	);

	server.registerTool(
		'get_agenda',
		{
			description:
				'List what is scheduled in a date range, ordered by start (all-day entries first on their day), as items with a "kind" field: "event" (a calendar Event), or "task" (a to-do) with a "placement": "time_block" (a Task with a Time block, spanning the block) or "due" (an open Task with a due date and no Time block: all-day entry, or a point at its due time). A Task that is both due and time-blocked appears once, as "time_block". Completed Tasks are not listed. Each item has start/end in UTC (timed) or dates (all-day) and startHome/endHome in the Home time zone; Events also have startLocal/endLocal in their own time zone. If from/to are dates (YYYY-MM-DD) they are Home-zone days and to is INCLUSIVE: from=to="2026-03-30" is that whole day. A datetime with Z/offset is an instant; without offset it is Home wall-clock time and to is exclusive.',
			inputSchema: z.object({
				from: z.string().describe('Range start: date or datetime'),
				to: z.string().describe('Range end: date (inclusive) or datetime (exclusive)')
			})
		},
		reply(({ from, to }) => planner.agenda(from, to))
	);
};
