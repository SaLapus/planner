import { z } from 'zod';
import { reply, type RegisterTools } from './support.js';

const schedule = z
	.discriminatedUnion('type', [
		z.object({ type: z.literal('per_week'), count: z.number().int().describe('Target check-ins per ISO week, 1-7') }),
		z.object({ type: z.literal('per_month'), count: z.number().int().describe('Target check-ins per calendar month, 1-31') }),
		z.object({
			type: z.literal('weekdays'),
			days: z.array(z.number().int()).describe('ISO weekdays: 1 = Monday ... 7 = Sunday; every listed day must be checked each week')
		})
	])
	.describe('How often the Habit should be done');

const dateArg = (what: string) =>
	z
		.string()
		.optional()
		.describe(
			`${what}: a local date YYYY-MM-DD in the owner's Home time zone (Europe/Istanbul), or an ISO instant with Z/offset. Defaults to today.`
		);

export const registerHabitTools: RegisterTools = (server, { planner, actor }) => {
	server.registerTool(
		'create_habit',
		{
			description:
				'Create a Habit. Schedule is one of: {type:"per_week",count}, {type:"per_month",count}, {type:"weekdays",days:[1..7]}. Returns the new Habit.',
			inputSchema: z.object({ title: z.string().describe('Habit name, any language'), schedule })
		},
		reply((args) => planner.createHabit(actor, args))
	);

	server.registerTool(
		'update_habit',
		{
			description: 'Change the title and/or schedule of a Habit. Past Check-ins are kept.',
			inputSchema: z.object({
				id: z.number().int(),
				title: z.string().optional(),
				schedule: schedule.optional()
			})
		},
		reply(({ id, ...patch }) => planner.updateHabit(actor, id, patch))
	);

	server.registerTool(
		'list_habits',
		{
			description: 'List Habits (without progress; use get_habit_status for that). Archived ones only with includeArchived.',
			inputSchema: z.object({ includeArchived: z.boolean().optional() })
		},
		reply(({ includeArchived }) => planner.listHabits({ includeArchived }))
	);

	server.registerTool(
		'archive_habit',
		{
			description: 'Archive a Habit: hide it from active lists but keep all its history.',
			inputSchema: z.object({ id: z.number().int() })
		},
		reply(({ id }) => planner.archiveHabit(actor, id))
	);

	server.registerTool(
		'unarchive_habit',
		{ description: 'Make an archived Habit active again.', inputSchema: z.object({ id: z.number().int() }) },
		reply(({ id }) => planner.unarchiveHabit(actor, id))
	);

	server.registerTool(
		'add_checkin',
		{
			description:
				'Record that a Habit was done on a date (yes/no Check-in). At most one per Habit per date; past dates are allowed, future ones are not. Returns the Check-in.',
			inputSchema: z.object({ habitId: z.number().int(), date: dateArg('Date of the Check-in') })
		},
		reply(({ habitId, date }) => planner.addCheckin(actor, habitId, { date }))
	);

	server.registerTool(
		'remove_checkin',
		{
			description:
				'Remove the Check-in of a Habit on a date (it goes to the Trash; bring it back with restore_item type "checkin", or revert with undo_change). To delete a whole Habit use delete_item with type "habit".',
			inputSchema: z.object({ habitId: z.number().int(), date: dateArg('Date of the Check-in to remove') })
		},
		reply(({ habitId, date }) => planner.removeCheckin(actor, habitId, date))
	);

	server.registerTool(
		'get_habit_status',
		{
			description:
				'Progress and Streak of Habits in a Period. period "week" = ISO week (Monday start) covers per-week and weekday Habits; "month" = calendar month covers per-month Habits; omit to get all Habits, each in its own period. ' +
				'`date` picks the period containing that local date (default today). Each result has done/target, met, open, streak (consecutive met periods; the open period never breaks it), and the Check-in dates. Archived Habits are excluded unless includeArchived.',
			inputSchema: z.object({
				period: z.enum(['week', 'month']).optional(),
				date: z.string().optional().describe('Local date YYYY-MM-DD inside the wanted period'),
				habitId: z.number().int().optional(),
				includeArchived: z.boolean().optional()
			})
		},
		reply((args) => planner.habitStatus(args))
	);
};
