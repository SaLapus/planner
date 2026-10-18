import { z } from 'zod';
import { reply, type RegisterTools } from './support.js';

const dueSchema = z
	.string()
	.describe(
		'ISO 8601: "2026-03-30" (date only = local date in the Home time zone), "2026-03-30T10:00" (Home-zone time), or with Z/offset'
	);
const prioritySchema = z.enum(['none', 'low', 'medium', 'high']);
const timeBlockSchema = z
	.object({
		start: z
			.string()
			.describe('Start datetime: "2026-03-30T10:00" (Home time zone) or with Z/offset'),
		minutes: z.number().int().describe('Length in minutes, 1..1440')
	})
	.describe(
		'Time block: when the Task is planned to be worked on. Time-blocked Tasks appear in get_agenda (placement "time_block") next to Events'
	);

const repeatSchema = z
	.discriminatedUnion('type', [
		z.object({
			type: z.literal('fixed'),
			rrule: z
				.string()
				.describe('RFC 5545 RRULE value, e.g. "FREQ=WEEKLY;BYDAY=MO" or "FREQ=MONTHLY;INTERVAL=2;COUNT=6"')
		}),
		z.object({
			type: z.literal('after'),
			every: z.number().int().describe('How many units after completion, 1..999'),
			unit: z.enum(['day', 'week', 'month', 'year'])
		})
	])
	.describe(
		'Repetition. "fixed" follows an RRULE counted from the due date (requires a due date); "after" schedules the next one N units after the day it is completed. Completing a repeating Task keeps it as done and creates the next instance (its id is nextId on the completed Task).'
	);

export const registerTaskTools: RegisterTools = (server, { planner, actor }) => {
	server.registerTool(
		'create_task',
		{
			description:
				'Create a Task (a to-do item) with a title and optional due date/time, priority, project and tags. Text is stored exactly as given, in any language. Returns the new Task (dueDate/dueTime are in the owner\'s Home time zone).',
			inputSchema: z.object({
				title: z.string().describe('What needs to be done'),
				due: dueSchema.optional(),
				priority: prioritySchema.optional(),
				time_block: timeBlockSchema.optional(),
				project_id: z.number().int().optional().describe('Project id from list_projects'),
				tags: z.array(z.string()).optional().describe('Free-form tags'),
				repeat: repeatSchema.optional()
			})
		},
		reply(({ title, due, priority, time_block, project_id, tags, repeat }) =>
			planner.createTask(actor, {
				title,
				due,
				priority,
				timeBlock: time_block,
				projectId: project_id,
				tags,
				repeat
			})
		)
	);

	server.registerTool(
		'update_task',
		{
			description:
				'Change a Task\'s title, due date/time, priority, Time block or repetition. Only the fields you pass change; pass due: null to remove the due date, time_block: null to clear the Time block and repeat: null to stop repeating. Returns the updated Task.',
			inputSchema: z.object({
				id: z.number().int().describe('Task id from list_tasks'),
				title: z.string().optional(),
				due: dueSchema.nullable().optional(),
				priority: prioritySchema.optional(),
				time_block: timeBlockSchema.nullable().optional(),
				repeat: repeatSchema.nullable().optional()
			})
		},
		reply(({ id, time_block, ...changes }) =>
			planner.updateTask(actor, id, { ...changes, timeBlock: time_block })
		)
	);

	server.registerTool(
		'get_task_list',
		{
			description:
				'Open Tasks in a smart list, computed from the current time in the owner\'s Home time zone, ordered by due date, due time, then priority (high first). today: due today and not yet late; overdue: due date or time has passed; upcoming: due after today; inbox: no due date.',
			inputSchema: z.object({ list: z.enum(['today', 'upcoming', 'overdue', 'inbox']) })
		},
		reply(({ list }) => planner.tasksIn(list))
	);

	server.registerTool(
		'search_tasks',
		{
			description: 'Find Tasks (done ones too) whose title contains the text, case-insensitive.',
			inputSchema: z.object({ text: z.string() })
		},
		reply(({ text }) => planner.searchTasks(text))
	);

	server.registerTool(
		'list_tasks',
		{
			description:
				'List Tasks, oldest first, optionally filtered by project_id (null = no project) and/or tag. A Task with completedAt set is done. Tasks of archived Projects are included.',
			inputSchema: z.object({
				project_id: z.number().int().nullable().optional(),
				tag: z.string().optional()
			})
		},
		reply(({ project_id, tag }) => planner.listTasks({ projectId: project_id, tag }))
	);

	server.registerTool(
		'complete_task',
		{
			description: 'Mark a Task as done. Fails if it is already completed. A repeating Task also gets its next instance (see nextId on the returned Task).',
			inputSchema: z.object({ id: z.number().int().describe('Task id from list_tasks') })
		},
		reply(({ id }) => planner.completeTask(actor, id))
	);

	server.registerTool(
		'uncomplete_task',
		{
			description: 'Mark a completed Task as open again. Removes the next instance it created, and fails if that one was already changed or completed. Fails if the Task is not completed.',
			inputSchema: z.object({ id: z.number().int().describe('Task id from list_tasks') })
		},
		reply(({ id }) => planner.uncompleteTask(actor, id))
	);
};
