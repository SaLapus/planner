import { z } from 'zod';
import { reply, type RegisterTools } from './support.js';

const taskId = z.number().int().describe('Task id from list_tasks');
const projectId = z.number().int().describe('Project id from list_projects');

export const registerOrganisingTools: RegisterTools = (server, { planner, actor }) => {
	server.registerTool(
		'create_project',
		{
			description: 'Create a Project (one level, used to group Tasks). Returns the new Project.',
			inputSchema: z.object({ name: z.string() })
		},
		reply(({ name }) => planner.createProject(actor, { name }))
	);
	server.registerTool(
		'rename_project',
		{
			description: 'Rename a Project.',
			inputSchema: z.object({ id: projectId, name: z.string() })
		},
		reply(({ id, name }) => planner.renameProject(actor, id, name))
	);
	server.registerTool(
		'archive_project',
		{
			description:
				'Archive a Project. It disappears from the default project list; its Tasks stay reachable via list_tasks with project_id.',
			inputSchema: z.object({ id: projectId })
		},
		reply(({ id }) => planner.archiveProject(actor, id))
	);
	server.registerTool(
		'unarchive_project',
		{ description: 'Bring an archived Project back.', inputSchema: z.object({ id: projectId }) },
		reply(({ id }) => planner.unarchiveProject(actor, id))
	);
	server.registerTool(
		'list_projects',
		{
			description: 'List Projects. Archived ones are hidden unless include_archived is true.',
			inputSchema: z.object({ include_archived: z.boolean().optional() })
		},
		reply(({ include_archived }) => planner.listProjects({ includeArchived: include_archived }))
	);
	server.registerTool(
		'set_task_project',
		{
			description:
				'Put a Task into a Project, or pass project_id null to remove it from its Project. Archived Projects cannot receive Tasks.',
			inputSchema: z.object({ task_id: taskId, project_id: projectId.nullable() })
		},
		reply(({ task_id, project_id }) => planner.setTaskProject(actor, task_id, project_id))
	);

	server.registerTool(
		'add_tag',
		{
			description: 'Add a free-form Tag to a Task. Fails if the Task already has it.',
			inputSchema: z.object({ task_id: taskId, tag: z.string() })
		},
		reply(({ task_id, tag }) => planner.addTag(actor, task_id, tag))
	);
	server.registerTool(
		'remove_tag',
		{
			description: 'Remove a Tag from a Task.',
			inputSchema: z.object({ task_id: taskId, tag: z.string() })
		},
		reply(({ task_id, tag }) => planner.removeTag(actor, task_id, tag))
	);
	server.registerTool(
		'list_tags',
		{
			description: 'List all Tags in use with the number of Tasks carrying each.',
			inputSchema: z.object({})
		},
		reply(() => planner.listTags())
	);

	server.registerTool(
		'add_subtask',
		{
			description: 'Append a Subtask (one-level checklist item) to a Task. Returns the whole Task.',
			inputSchema: z.object({ task_id: taskId, title: z.string() })
		},
		reply(({ task_id, title }) => planner.addSubtask(actor, task_id, title))
	);
	server.registerTool(
		'set_subtask_done',
		{
			description: 'Check (done=true) or uncheck (done=false) a Subtask. Returns the whole Task.',
			inputSchema: z.object({
				task_id: taskId,
				subtask_id: z.number().int().describe('Subtask id from the Task'),
				done: z.boolean()
			})
		},
		reply(({ task_id, subtask_id, done }) =>
			planner.setSubtaskDone(actor, task_id, subtask_id, done)
		)
	);
	server.registerTool(
		'remove_subtask',
		{
			description: 'Remove a Subtask from a Task. Returns the whole Task.',
			inputSchema: z.object({ task_id: taskId, subtask_id: z.number().int() })
		},
		reply(({ task_id, subtask_id }) => planner.removeSubtask(actor, task_id, subtask_id))
	);
	server.registerTool(
		'reorder_subtasks',
		{
			description:
				"Set the order of a Task's Subtasks. ordered_ids must contain every Subtask id of the Task exactly once.",
			inputSchema: z.object({ task_id: taskId, ordered_ids: z.array(z.number().int()) })
		},
		reply(({ task_id, ordered_ids }) => planner.reorderSubtasks(actor, task_id, ordered_ids))
	);
};
