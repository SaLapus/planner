import { z } from 'zod';
import { reply, type RegisterTools } from './support.js';

export const registerTaskTools: RegisterTools = (server, { planner, actor }) => {
	server.registerTool(
		'create_task',
		{
			description:
				'Create a Task (a to-do item) with a title. Text is stored exactly as given, in any language. Returns the new Task.',
			inputSchema: z.object({ title: z.string().describe('What needs to be done') })
		},
		reply(({ title }) => planner.createTask(actor, { title }))
	);

	server.registerTool(
		'list_tasks',
		{
			description: 'List all Tasks, oldest first. A Task with completedAt set is done.',
			inputSchema: z.object({})
		},
		reply(() => planner.listTasks())
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
