// The top navigation bar's items, in one place, and the rule for which one is current.
// The bar itself is rendered by +layout.svelte; logout is a POST form there, not an item here.

export type NavItem = { href: string; label: string };

export const NAV_MAIN: NavItem[] = [
	{ href: '/', label: 'Задачи' },
	{ href: '/events', label: 'Расписание' },
	{ href: '/habits', label: 'Привычки' },
	{ href: '/goals', label: 'Цели' },
	{ href: '/reviews', label: 'Обзоры' },
	{ href: '/stats', label: 'Статистика' }
];

export const NAV_SECONDARY: NavItem[] = [
	{ href: '/projects', label: 'Проекты' },
	{ href: '/trash', label: 'Корзина' },
	{ href: '/changes', label: 'Журнал' }
];

// Pages that belong to a section whose first path segment is different.
const ALIASES: Record<string, string> = { '/calendar': '/events' };

/** The `href` of the bar item a path belongs to, from its first path segment; null if none. */
export function currentSection(pathname: string): string | null {
	const first = pathname.split('/').filter(Boolean)[0];
	const href = first === undefined ? '/' : (ALIASES['/' + first] ?? '/' + first);
	return [...NAV_MAIN, ...NAV_SECONDARY].some((i) => i.href === href) ? href : null;
}

/** The bar is on every page except the /auth/* ones. */
export function showsNav(pathname: string): boolean {
	return pathname !== '/auth' && !pathname.startsWith('/auth/');
}
