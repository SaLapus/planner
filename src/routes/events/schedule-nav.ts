// The Schedule section's second row (Неделя · День · Список · Лента; "+ Событие" is rendered
// separately), and which view a path belongs to.

export type ScheduleItem = { href: string; label: string; current: boolean };

export function scheduleItems(today: string, pathname: string): ScheduleItem[] {
	return [
		{ href: `/events/week/${today}`, label: 'Неделя', current: pathname.startsWith('/events/week/') },
		{ href: `/events/day/${today}`, label: 'День', current: pathname.startsWith('/events/day/') },
		{ href: '/events/list', label: 'Список', current: pathname === '/events/list' },
		{ href: '/calendar', label: 'Лента', current: pathname === '/calendar' }
	];
}

/** The "+ Событие" link; `date` (a day the page is showing) prefills the new Event's date. */
export function newEventHref(date?: string): string {
	return date ? `/events/new?date=${date}` : '/events/new';
}
