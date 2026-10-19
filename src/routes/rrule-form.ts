// Pieces shared by the two RRULE form editors (routes/repeat-form.ts for Tasks and
// routes/events/recurrence-form.ts for Events): the FREQ <-> unit mapping, splitting a rule into
// its parts, and Russian plural forms.

export type Unit = 'day' | 'week' | 'month' | 'year';

export const FREQ_OF_UNIT: Record<Unit, string> = {
	day: 'DAILY',
	week: 'WEEKLY',
	month: 'MONTHLY',
	year: 'YEARLY'
};
export const UNIT_OF_FREQ = Object.fromEntries(
	Object.entries(FREQ_OF_UNIT).map(([unit, freq]) => [freq, unit])
) as Record<string, Unit>;

/** "FREQ=WEEKLY;BYDAY=MO" -> Map { FREQ => WEEKLY, BYDAY => MO }. */
export function ruleParts(rule: string): Map<string, string> {
	const map = new Map<string, string>();
	for (const p of rule.split(';')) {
		const [k, v] = p.split('=');
		map.set(k, v);
	}
	return map;
}

/** The `{ freq, interval }` of a rule that is nothing but FREQ[;INTERVAL], or null for anything richer. */
export function simpleRule(rule: string): { freq: string; interval: number } | null {
	const m = /^FREQ=(DAILY|WEEKLY|MONTHLY|YEARLY)(?:;INTERVAL=(\d+))?$/.exec(rule);
	return m ? { freq: m[1], interval: m[2] ? Number(m[2]) : 1 } : null;
}

/** Russian plural form for a count: forms = [1 день, 2-4 дня, 5-20 дней]; 21 день, 22 дня, 11-14 дней... */
export function plural(n: number, [one, few, many]: [string, string, string]): string {
	const mod10 = n % 10;
	const mod100 = n % 100;
	if (mod10 === 1 && mod100 !== 11) return one;
	if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
	return many;
}
