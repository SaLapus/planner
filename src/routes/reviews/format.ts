// Russian wording for a Review's period. Pure functions, so they are easy to test.
const day = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', timeZone: 'UTC' });
const dayMonth = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', timeZone: 'UTC' });
const monthYear = new Intl.DateTimeFormat('ru-RU', { month: 'long', year: 'numeric', timeZone: 'UTC' });

const utc = (isoDate: string) => new Date(`${isoDate}T00:00:00Z`);

/** 'week', '2026-01-05' -> 'Неделя 5–11 января 2026'; 'month', '2026-01-01' -> 'Январь 2026'. */
export function periodTitle(type: 'week' | 'month', start: string): string {
	if (type === 'month') {
		const text = monthYear.format(utc(start)).replace(/\s*г\.$/, '');
		return text.charAt(0).toUpperCase() + text.slice(1);
	}
	const first = utc(start);
	const last = new Date(first.getTime() + 6 * 86_400_000);
	const year = last.getUTCFullYear();
	const from = first.getUTCMonth() === last.getUTCMonth() ? day.format(first) : dayMonth.format(first);
	return `Неделя ${from}–${dayMonth.format(last)} ${year}`;
}
