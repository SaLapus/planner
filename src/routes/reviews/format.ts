// Russian wording for a Review's period. Pure functions, so they are easy to test.
// Dates are Temporal.PlainDate (a calendar date has no time zone), formatted with Intl.
const day = new Intl.DateTimeFormat('ru-RU', { day: 'numeric' });
const dayMonth = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long' });
const monthYear = new Intl.DateTimeFormat('ru-RU', { month: 'long', year: 'numeric' });

/** 'week', '2026-01-05' -> 'Неделя 5–11 января 2026'; 'month', '2026-01-01' -> 'Январь 2026'. */
export function periodTitle(type: 'week' | 'month', start: string): string {
	if (type === 'month') {
		const text = monthYear.format(Temporal.PlainDate.from(start)).replace(/\s*г\.$/, '');
		return text.charAt(0).toUpperCase() + text.slice(1);
	}
	const first = Temporal.PlainDate.from(start);
	const last = first.add({ days: 6 });
	const from = first.month === last.month ? day.format(first) : dayMonth.format(first);
	return `Неделя ${from}–${dayMonth.format(last)} ${last.year}`;
}
