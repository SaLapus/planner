import { z } from 'zod';
import { reply, type RegisterTools } from './support.js';

export const registerTaskTools: RegisterTools = (server, { planner, actor }) => {
	server.registerTool(
		'create_task',
		{
			description:
				'Create a Task (a to-do item) with a title. Text is stored exactly as given, in any language. Returns the new Task.',
			inputSchema: z.object({
				title: z.string().describe('What needs to be done'),
				project_id: z.number().int().optional().describe('Project id from list_projects'),
				tags: z.array(z.string()).optional().describe('Free-form tags')
			})
		},
		reply(({ title, project_id, tags }) =>
			planner.createTask(actor, { title, projectId: project_id, tags })
		)
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
