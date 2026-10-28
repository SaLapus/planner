// Server-side half of the page. Svelte note: SvelteKit runs `load` on the
// server before showing the page, and `actions` receive <form> posts.
// This file only translates form data into core calls; all rules live in the core.
import { fail } from '@sveltejs/kit';
import { getPlanner, HOME_TIME_ZONE } from '#lib/server/planner.js';
import type { Task } from '#lib/core/index.js';
import type { Actions, PageServerLoad } from './$types';
import { repeatFields, repeatLabel, repeatOf } from './repeat-form.js';
import { actorOf, errorText } from '#lib/server/request.js';

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

// The "Начало" date input: empty means the default Start date (on the edit form: reset to it).
// On the edit form an untouched input (same as `shownStartDate`) is left out, so moving only the due date
// earlier pulls the Start date back instead of conflicting with the old one.
function startDateOf(form: FormData): string | null | undefined {
	const value = String(form.get('startDate') ?? '');
	if (form.has('shownStartDate') && value === form.get('shownStartDate')) return undefined;
	return value || null;
}

// Time block inputs (date + time + minutes) become `{ start, minutes }`. An empty date or time
// means "no Time block", which on the edit form clears an existing one.
function blockOf(form: FormData) {
	const date = String(form.get('blockDate') ?? '');
	const time = String(form.get('blockTime') ?? '');
	if (!date || !time) return null;
	return { start: `${date}T${time}`, minutes: Number(form.get('blockMinutes') ?? 60) };
}

// The block as the form shows it: Home-zone date, time and minutes (the core stores a UTC instant).
function blockFields(block: { start: string; minutes: number } | null) {
	if (!block) return null;
	const start = Temporal.Instant.from(block.start).toZonedDateTimeISO(HOME_TIME_ZONE);
	const end = start.add({ minutes: block.minutes });
	const time = (z: Temporal.ZonedDateTime) => z.toPlainTime().toString({ smallestUnit: 'minute' });
	return {
		date: start.toPlainDate().toString(),
		time: time(start),
		minutes: block.minutes,
		label: `${start.toPlainDate().toString()} ${time(start)}–${time(end)}`
	};
}

function priorityOf(form: FormData) {
	const p = String(form.get('priority') ?? 'none');
	return (PRIORITIES as readonly string[]).includes(p)
		? (p as (typeof PRIORITIES)[number])
		: 'none';
}

// `?list=today` picks a smart list, `?q=молоко` searches, `?project=3|none` and `?tag=дом` narrow
// further; filters combine. No parameters shows everything.
export const load: PageServerLoad = ({ url }) => {
	const planner = getPlanner();
	const q = url.searchParams.get('q')?.trim() ?? '';
	const listParam = url.searchParams.get('list') ?? '';
	const list = (LISTS as readonly string[]).includes(listParam)
		? (listParam as (typeof LISTS)[number])
		: null;
	const p = url.searchParams.get('project');
	const tag = url.searchParams.get('tag') ?? undefined;
	const projectId = p === null ? undefined : p === 'none' ? null : Number(p);
	// "Все" without search: the split view (Active / not started / Completed).
	const splitView = !q && !list;
	let tasks: Task[] = [];
	if (q) tasks = planner.searchTasks(q);
	else if (list) tasks = planner.tasksIn(list);
	// Search and smart lists don't take project/tag filters themselves; narrow their result here.
	if (q || list) {
		tasks = tasks.filter(
			(t) =>
				(projectId === undefined || t.projectId === projectId) &&
				(tag === undefined || t.tags.includes(tag))
		);
	}
	const today = planner.today();
	const withDisplayFields = (t: Task) => ({
		...t,
		startsLater: t.startDate > today,
		block: blockFields(t.timeBlock),
		repeatForm: repeatFields(t.repeat),
		repeatText: repeatLabel(t.repeat)
	});
	const groups = splitView ? planner.tasksSplit({ projectId, tag }) : null;
	return {
		tasks: tasks.map(withDisplayFields),
		split: groups && {
			active: groups.active.map(withDisplayFields),
			notStarted: groups.notStarted.map(withDisplayFields),
			completed: groups.completed.map(withDisplayFields)
		},
		list,
		q,
		projects: planner.listProjects(),
		// every project incl. archived, so a task in an archived project can still show its name
		allProjects: planner.listProjects({ includeArchived: true }),
		tags: planner.listTags(),
		filter: { project: p, tag: tag ?? null }
	};
};

// Runs a core call and turns a rule violation into a visible error message.
function run(fn: () => unknown) {
	try {
		fn();
	} catch (e) {
		return fail(400, { error: errorText(e) });
	}
}

export const actions: Actions = {
	add: async ({ request, locals }) => {
		const data = await request.formData();
		const title = String(data.get('title') ?? '');
		try {
			getPlanner().createTask(actorOf(locals), {
				title,
				due: dueOf(data),
				start: startDateOf(data),
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
				start: startDateOf(data),
				priority: priorityOf(data),
				notes: String(data.get('notes') ?? ''),
				timeBlock: blockOf(data)
			});
		} catch (e) {
			return fail(400, { error: errorText(e) });
		}
	},
	// Repetition has its own small form so that saving the main edit form never changes it.
	setRepeat: async ({ request, locals }) => {
		const f = await request.formData();
		const repeat = repeatOf(f);
		if (repeat === undefined) return;
		try {
			getPlanner().updateTask(actorOf(locals), Number(f.get('id')), { repeat });
		} catch (e) {
			return fail(400, { error: errorText(e) });
		}
	},
	setProject: async ({ request, locals }) => {
		const f = await request.formData();
		const raw = String(f.get('projectId') ?? '');
		return run(() =>
			getPlanner().setTaskProject(actorOf(locals), Number(f.get('id')), raw === '' ? null : Number(raw))
		);
	},
	addTag: async ({ request, locals }) => {
		const f = await request.formData();
		return run(() => getPlanner().addTag(actorOf(locals), Number(f.get('id')), String(f.get('tag') ?? '')));
	},
	removeTag: async ({ request, locals }) => {
		const f = await request.formData();
		return run(() => getPlanner().removeTag(actorOf(locals), Number(f.get('id')), String(f.get('tag') ?? '')));
	},
	addSubtask: async ({ request, locals }) => {
		const f = await request.formData();
		return run(() =>
			getPlanner().addSubtask(actorOf(locals), Number(f.get('id')), String(f.get('title') ?? ''))
		);
	},
	toggleSubtask: async ({ request, locals }) => {
		const f = await request.formData();
		return run(() =>
			getPlanner().setSubtaskDone(
				actorOf(locals),
				Number(f.get('id')),
				Number(f.get('subtaskId')),
				f.get('done') === 'true'
			)
		);
	},
	removeSubtask: async ({ request, locals }) => {
		const f = await request.formData();
		return run(() =>
			getPlanner().removeSubtask(actorOf(locals), Number(f.get('id')), Number(f.get('subtaskId')))
		);
	},
	moveSubtask: async ({ request, locals }) => {
		// "dir" is -1 (up) or 1 (down): swap the subtask with its neighbour.
		const f = await request.formData();
		const id = Number(f.get('id'));
		const subtaskId = Number(f.get('subtaskId'));
		const dir = Number(f.get('dir'));
		return run(() => {
			const planner = getPlanner();
			const ids = planner.getTask(id).subtasks.map((s) => s.id);
			const i = ids.indexOf(subtaskId);
			const j = i + dir;
			if (i < 0 || j < 0 || j >= ids.length) return;
			[ids[i], ids[j]] = [ids[j], ids[i]];
			planner.reorderSubtasks(actorOf(locals), id, ids);
		});
	},
	// Delete = move to Trash (restorable on /trash). Works the same for any entity type.
	delete: async ({ request, locals }) => {
		const id = Number((await request.formData()).get('id'));
		try {
			getPlanner().deleteItem(actorOf(locals), 'task', id);
		} catch (e) {
			return fail(400, { error: errorText(e) });
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
