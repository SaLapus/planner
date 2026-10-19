// Server half of the goal page. `load` reads progress; every action is a thin translation of a form post
// into one core command. No goal rules live here - the core decides (and refuses with a message).
import { error, fail, redirect, type Action } from '@sveltejs/kit';
import { getPlanner } from '#lib/server/planner.js';
import type { Actor, GoalStatus } from '#lib/core/index.js';
import type { Actions, PageServerLoad } from './$types';
import { actorOf, errorText } from '#lib/server/request.js';

export const load: PageServerLoad = ({ params }) => {
	const planner = getPlanner();
	const id = Number(params.id);
	if (!planner.listGoals().some((g) => g.id === id)) error(404, 'Цель не найдена');
	const [progress] = planner.goalProgress({ goalId: id });
	return {
		progress,
		// What can still be linked: open Tasks with no Milestone, active Habits with no Goal.
		linkableTasks: planner.listTasks().filter((t) => t.completedAt === null && t.milestoneId === null),
		linkableHabits: planner.listHabits().filter((h) => h.goalId === null)
	};
};

const run =
	(fn: (form: FormData, actor: Actor, goalId: number) => void): Action =>
	async ({ request, locals, params }) => {
		try {
			fn(await request.formData(), actorOf(locals), Number(params.id));
		} catch (e) {
			return fail(400, { error: errorText(e) });
		}
	};

const num = (form: FormData, name: string) => Number(form.get(name));
const text = (form: FormData, name: string) => String(form.get(name) ?? '');

export const actions: Actions = {
	save: run((form, actor, id) => {
		getPlanner().updateGoal(actor, id, {
			title: text(form, 'title'),
			description: text(form, 'description'),
			targetDate: text(form, 'targetDate') || null
		});
	}),
	status: run((form, actor, id) => {
		getPlanner().setGoalStatus(actor, id, text(form, 'status') as GoalStatus);
	}),
	delete: async ({ locals, params }) => {
		getPlanner().deleteItem(actorOf(locals), 'goal', Number(params.id)); // goes to /trash, can be restored
		redirect(303, '/goals');
	},

	addMilestone: run((form, actor, id) => {
		getPlanner().addMilestone(actor, id, { title: text(form, 'title'), targetDate: text(form, 'targetDate') || null });
	}),
	editMilestone: run((form, actor) => {
		getPlanner().updateMilestone(actor, num(form, 'id'), {
			title: text(form, 'title'),
			targetDate: text(form, 'targetDate') || null
		});
	}),
	// `done=true|false` is the NEW state the button asks for.
	toggleMilestone: run((form, actor) => {
		getPlanner().setMilestoneDone(actor, num(form, 'id'), form.get('done') === 'true');
	}),
	// `dir` is -1 (up) or 1 (down): swap the Milestone with its neighbour, then send the full order to the core.
	moveMilestone: run((form, actor, goalId) => {
		const planner = getPlanner();
		const ids = planner.getGoal(goalId).milestones.map((m) => m.id);
		const from = ids.indexOf(num(form, 'id'));
		const to = from + num(form, 'dir');
		if (from < 0 || to < 0 || to >= ids.length) return;
		[ids[from], ids[to]] = [ids[to], ids[from]];
		planner.reorderMilestones(actor, goalId, ids);
	}),
	deleteMilestone: run((form, actor) => {
		getPlanner().deleteItem(actor, 'milestone', num(form, 'id'));
	}),

	// Links. `milestoneId` empty means "unlink".
	linkTask: run((form, actor) => {
		const milestoneId = text(form, 'milestoneId');
		getPlanner().setTaskMilestone(actor, num(form, 'taskId'), milestoneId === '' ? null : Number(milestoneId));
	}),
	linkHabit: run((form, actor, goalId) => {
		getPlanner().linkHabitToGoal(actor, num(form, 'habitId'), form.get('unlink') ? null : goalId);
	})
};
