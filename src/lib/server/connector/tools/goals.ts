import { z } from 'zod';
import { reply, type RegisterTools } from './support.js';

const goalId = z.number().int().describe('Goal id from list_goals');
const milestoneId = z.number().int().describe('Milestone id (see get_goal_progress or get_goal)');
const date = (what: string) =>
	z.string().nullable().optional().describe(`${what}: local date YYYY-MM-DD, or null to clear`);

export const registerGoalTools: RegisterTools = (server, { planner, actor }) => {
	server.registerTool(
		'create_goal',
		{
			description:
				'Create a long-term Goal (status starts as "active"). Break it into Milestones with add_milestone. Returns the Goal.',
			inputSchema: z.object({
				title: z.string().describe('Goal name, any language'),
				description: z.string().optional(),
				targetDate: date('Target date')
			})
		},
		reply((args) => planner.createGoal(actor, args))
	);

	server.registerTool(
		'update_goal',
		{
			description: 'Change the title, description and/or target date of a Goal. Use set_goal_status to change its status.',
			inputSchema: z.object({
				id: goalId,
				title: z.string().optional(),
				description: z.string().optional(),
				targetDate: date('Target date')
			})
		},
		reply(({ id, ...patch }) => planner.updateGoal(actor, id, patch))
	);

	server.registerTool(
		'set_goal_status',
		{
			description:
				'Set a Goal status: active, paused, achieved or dropped. Any status can follow any other (e.g. reopen an achieved Goal); setting the current status is an error. Links to Tasks and Habits are kept.',
			inputSchema: z.object({ id: goalId, status: z.enum(['active', 'paused', 'achieved', 'dropped']) })
		},
		reply(({ id, status }) => planner.setGoalStatus(actor, id, status))
	);

	server.registerTool(
		'list_goals',
		{
			description: 'List Goals (without Milestones; use get_goal_progress for details). Optionally only one status.',
			inputSchema: z.object({ status: z.enum(['active', 'paused', 'achieved', 'dropped']).optional() })
		},
		reply(({ status }) => planner.listGoals({ status }))
	);

	server.registerTool(
		'get_goal',
		{
			description: 'One Goal with its ordered Milestones.',
			inputSchema: z.object({ id: goalId })
		},
		reply(({ id }) => planner.getGoal(id))
	);

	server.registerTool(
		'add_milestone',
		{
			description: 'Add a Milestone at the end of a Goal. Returns the Milestone.',
			inputSchema: z.object({ goalId, title: z.string(), targetDate: date('Target date') })
		},
		reply(({ goalId, ...input }) => planner.addMilestone(actor, goalId, input))
	);

	server.registerTool(
		'update_milestone',
		{
			description: 'Change the title and/or target date of a Milestone.',
			inputSchema: z.object({ id: milestoneId, title: z.string().optional(), targetDate: date('Target date') })
		},
		reply(({ id, ...patch }) => planner.updateMilestone(actor, id, patch))
	);

	server.registerTool(
		'set_milestone_done',
		{
			description: 'Mark a Milestone done (done=true) or not done (done=false).',
			inputSchema: z.object({ id: milestoneId, done: z.boolean() })
		},
		reply(({ id, done }) => planner.setMilestoneDone(actor, id, done))
	);

	server.registerTool(
		'reorder_milestones',
		{
			description: 'Set the order of a Goal\'s Milestones. `orderedIds` must list every Milestone of the Goal exactly once.',
			inputSchema: z.object({ goalId, orderedIds: z.array(z.number().int()) })
		},
		reply(({ goalId, orderedIds }) => planner.reorderMilestones(actor, goalId, orderedIds))
	);

	server.registerTool(
		'link_task_to_milestone',
		{
			description:
				'Link a Task to a Milestone so the Task counts toward that Goal, or pass milestoneId null to unlink. A Task has at most one Milestone. To delete a Goal or Milestone use delete_item (type "goal" / "milestone"); links come back when it is restored.',
			inputSchema: z.object({
				taskId: z.number().int(),
				milestoneId: z.number().int().nullable().describe('Milestone id, or null to unlink')
			})
		},
		reply(({ taskId, milestoneId }) => planner.setTaskMilestone(actor, taskId, milestoneId))
	);

	server.registerTool(
		'link_habit_to_goal',
		{
			description: 'Link a Habit to a Goal it supports, or pass goalId null to unlink. A Habit has at most one Goal.',
			inputSchema: z.object({
				habitId: z.number().int(),
				goalId: z.number().int().nullable().describe('Goal id, or null to unlink')
			})
		},
		reply(({ habitId, goalId }) => planner.linkHabitToGoal(actor, habitId, goalId))
	);

	server.registerTool(
		'get_goal_progress',
		{
			description:
				'Progress of one Goal (goalId) or of all active Goals (omit goalId; includeInactive adds paused/achieved/dropped). ' +
				'Per Goal: milestones {done, total, percent} (done Milestones / total), the ordered Milestones, linked Tasks (done/total and the Tasks with the Milestone they serve), ' +
				'and linked Habits with their current-Period status (done/target, met, Streak, Check-in dates).',
			inputSchema: z.object({ goalId: goalId.optional(), includeInactive: z.boolean().optional() })
		},
		reply((args) => planner.goalProgress(args))
	);
};
