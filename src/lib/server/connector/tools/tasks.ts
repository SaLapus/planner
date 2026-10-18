import { z } from 'zod';
import { reply, type RegisterTools } from './support.js';

const dueSchema = z
	.string()
	.describe(
		'ISO 8601: "2026-03-30" (date only = local date in the Home time zone), "2026-03-30T10:00" (Home-zone time), or with Z/offset'
	);
const prioritySchema = z.enum(['none', 'low', 'medium', 'high']);

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
				project_id: z.number().int().optional().describe('Project id from list_projects'),
				tags: z.array(z.string()).optional().describe('Free-form tags')
			})
		},
		reply(({ title, due, priority, project_id, tags }) =>
			planner.createTask(actor, { title, due, priority, projectId: project_id, tags })
		)
	);

	server.registerTool(
		'update_task',
		{
			description:
				'Change a Task\'s title, due date/time or priority. Only the fields you pass change; pass due: null to remove the due date. Returns the updated Task.',
			inputSchema: z.object({
				id: z.number().int().describe('Task id from list_tasks'),
				title: z.string().optional(),
				due: dueSchema.nullable().optional(),
				priority: prioritySchema.optional()
			})
		},
		reply(({ id, ...changes }) => planner.updateTask(actor, id, changes))
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
			description: 'Mark a Task as done. Fails if it is already completed.',
			inputSchema: z.object({ id: z.number().int().describe('Task id from list_tasks') })
		},
		reply(({ id }) => planner.completeTask(actor, id))
	);

	server.registerTool(
		'uncomplete_task',
		{
			description: 'Mark a completed Task as open again. Fails if it is not completed.',
			inputSchema: z.object({ id: z.number().int().describe('Task id from list_tasks') })
		},
		reply(({ id }) => planner.uncompleteTask(actor, id))
	);
};
