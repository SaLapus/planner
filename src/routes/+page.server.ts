// Server-side half of the page. Svelte note: SvelteKit runs `load` on the
// server before showing the page, and `actions` receive <form> posts.
// This file only translates form data into core calls; all rules live in the core.
import { fail } from '@sveltejs/kit';
import { getPlanner } from '#lib/server/planner.js';
import type { Actions, PageServerLoad } from './$types';

// Every UI request has passed the login check in hooks.server.ts, which sets locals.actor to 'owner'.
function actorOf(locals: App.Locals) {
	if (!locals.actor) throw new Error('Not authenticated');
	return locals.actor;
}

const LISTS = ['today', 'upcoming', 'overdue', 'inbox'] as const;
const PRIORITIES = ['none', 'low', 'medium', 'high'] as const;

// The date and time inputs of a form become one ISO text ("2026-03-30" or "2026-03-30T10:00"),
// which the core understands. An empty date means "no due date" (a time alone is ignored).
function dueOf(form: FormData): string | null {
	const date = String(form.get('dueDate') ?? '');
	const time = String(form.get('dueTime') ?? '');
	if (!date) return null;
	return time ? `${date}T${time}` : date;
}

function priorityOf(form: FormData) {
	const p = String(form.get('priority') ?? 'none');
	return (PRIORITIES as readonly string[]).includes(p)
		? (p as (typeof PRIORITIES)[number])
		: 'none';
}

const errorText = (e: unknown) => (e instanceof Error ? e.message : 'Ошибка');

// `?list=today` picks a smart list, `?q=молоко` searches; no parameters shows everything.
export const load: PageServerLoad = ({ url }) => {
	const planner = getPlanner();
	const q = url.searchParams.get('q')?.trim() ?? '';
	const listParam = url.searchParams.get('list') ?? '';
	const list = (LISTS as readonly string[]).includes(listParam)
		? (listParam as (typeof LISTS)[number])
		: null;
	const tasks = q ? planner.searchTasks(q) : list ? planner.tasksIn(list) : planner.listTasks();
	return { tasks, list, q };
};

export const actions: Actions = {
	add: async ({ request, locals }) => {
		const data = await request.formData();
		const title = String(data.get('title') ?? '');
		try {
			getPlanner().createTask(actorOf(locals), {
				title,
				due: dueOf(data),
				priority: priorityOf(data)
			});
		} catch (e) {
			return fail(400, { title, error: errorText(e) });
		}
	},
	edit: async ({ request, locals }) => {
		const data = await request.formData();
		try {
			getPlanner().updateTask(actorOf(locals), Number(data.get('id')), {
				title: String(data.get('title') ?? ''),
				due: dueOf(data),
				priority: priorityOf(data)
			});
		} catch (e) {
			return fail(400, { error: errorText(e) });
		}
	},
	// Delete = move to Trash (restorable on /trash). Works the same for any entity type.
	delete: async ({ request, locals }) => {
		const id = Number((await request.formData()).get('id'));
		try {
			getPlanner().deleteItem(actorOf(locals), 'task', id);
		} catch (e) {
			return fail(400, { error: e instanceof Error ? e.message : 'Ошибка' });
		}
	},
	toggle: async ({ request, locals }) => {
		const form = await request.formData();
		const id = Number(form.get('id'));
		const planner = getPlanner();
		try {
			if (form.get('done') === 'true') planner.completeTask(actorOf(locals), id);
			else planner.uncompleteTask(actorOf(locals), id);
		} catch (e) {
			return fail(400, { error: errorText(e) });
		}
	}
};
