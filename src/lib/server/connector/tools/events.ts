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
				'List what is scheduled in a date range, ordered by start, as items with a "kind" field (currently only "event"). Each item has start/end in UTC (timed) or dates (all-day), plus startLocal/endLocal in the item\'s own time zone and startHome/endHome in the Home time zone. If from/to are dates (YYYY-MM-DD) they are Home-zone days and to is INCLUSIVE: from=to="2026-03-30" is that whole day. A datetime with Z/offset is an instant; without offset it is Home wall-clock time and to is exclusive.',
			inputSchema: z.object({
				from: z.string().describe('Range start: date or datetime'),
				to: z.string().describe('Range end: date (inclusive) or datetime (exclusive)')
			})
		},
		reply(({ from, to }) => planner.agenda(from, to))
	);
};
