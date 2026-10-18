// Small helpers shared by the habit pages (server side): turn form fields into a core schedule.
import type { HabitSchedule } from '#lib/core/index.js';

export function scheduleFromForm(form: FormData): HabitSchedule {
	const type = String(form.get('type'));
	if (type === 'weekdays') return { type, days: form.getAll('days').map(Number) };
	if (type === 'per_week' || type === 'per_month') return { type, count: Number(form.get('count')) };
	throw new Error('Выберите расписание');
}

export const errorText = (e: unknown) => (e instanceof Error ? e.message : 'Ошибка');
