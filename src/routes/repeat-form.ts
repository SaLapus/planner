// Translates between a Task's repetition and the simple repeat form on the task list.
// The form offers: no repetition, "by schedule" (fixed: every N days/weeks/months/years from the
// due date) and "after completion" (N days/weeks/... after I mark it done). Richer RRULEs (set by
// Claude, e.g. "every Monday and Thursday") are shown as-is and left untouched by the form.
import type { Repeat, RepeatUnit } from '#lib/core/tasks.js';

const FREQ: Record<RepeatUnit, string> = {
	day: 'DAILY',
	week: 'WEEKLY',
	month: 'MONTHLY',
	year: 'YEARLY'
};
const UNIT_OF = Object.fromEntries(Object.entries(FREQ).map(([u, f]) => [f, u])) as Record<
	string,
	RepeatUnit
>;

export interface RepeatFields {
	/** 'none' | 'fixed' | 'after' | 'custom' (a fixed rule the form cannot show; submitting it changes nothing). */
	kind: 'none' | 'fixed' | 'after' | 'custom';
	every: number;
	unit: RepeatUnit;
}

/** What the form shows for a Task's current repetition. */
export function repeatFields(repeat: Repeat | null): RepeatFields {
	if (!repeat) return { kind: 'none', every: 1, unit: 'week' };
	if (repeat.type === 'after') return { kind: 'after', every: repeat.every, unit: repeat.unit };
	const m = /^FREQ=(DAILY|WEEKLY|MONTHLY|YEARLY)(?:;INTERVAL=(\d+))?$/.exec(repeat.rrule);
	if (!m) return { kind: 'custom', every: 1, unit: 'week' };
	return { kind: 'fixed', every: m[2] ? Number(m[2]) : 1, unit: UNIT_OF[m[1]] };
}

/**
 * The repetition the submitted form asks for: a Repeat, null (stop repeating) or undefined
 * (leave as it is). The core validates the numbers.
 */
export function repeatOf(form: FormData): Repeat | null | undefined {
	const kind = String(form.get('repeatKind') ?? 'none');
	const every = Number(form.get('repeatEvery') ?? 1);
	const unit = String(form.get('repeatUnit') ?? 'week') as RepeatUnit;
	if (kind === 'custom') return undefined;
	if (kind === 'after') return { type: 'after', every, unit };
	if (kind === 'fixed') {
		const interval = every === 1 ? '' : `;INTERVAL=${every}`;
		return { type: 'fixed', rrule: `FREQ=${FREQ[unit] ?? unit}${interval}` };
	}
	return null;
}

const WORDS: Record<RepeatUnit, [string, string, string]> = {
	day: ['день', 'дня', 'дней'],
	week: ['неделя', 'недели', 'недель'],
	month: ['месяц', 'месяца', 'месяцев'],
	year: ['год', 'года', 'лет']
};

// Russian counting: 1 день, 2-4 дня, 5-20 дней, 21 день...
function word(n: number, unit: RepeatUnit) {
	const [one, few, many] = WORDS[unit];
	const mod10 = n % 10;
	const mod100 = n % 100;
	if (mod10 === 1 && mod100 !== 11) return one;
	if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
	return many;
}

const SINGLE: Record<RepeatUnit, string> = {
	day: 'каждый день',
	week: 'каждую неделю',
	month: 'каждый месяц',
	year: 'каждый год'
};

/** Short Russian label for the task row, e.g. "каждые 2 недели" or "через 3 дня после выполнения". */
export function repeatLabel(repeat: Repeat | null): string {
	if (!repeat) return '';
	const f = repeatFields(repeat);
	if (f.kind === 'custom') return `по правилу ${repeat.type === 'fixed' ? repeat.rrule : ''}`;
	if (f.kind === 'after') return `через ${f.every} ${word(f.every, f.unit)} после выполнения`;
	return f.every === 1 ? SINGLE[f.unit] : `каждые ${f.every} ${word(f.every, f.unit)}`;
}
