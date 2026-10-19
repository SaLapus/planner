// Translates between a Task's repetition and the simple repeat form on the task list.
// The form offers: no repetition, "by schedule" (fixed: every N days/weeks/months/years from the
// due date) and "after completion" (N days/weeks/... after I mark it done). Richer RRULEs (set by
// Claude, e.g. "every Monday and Thursday") are shown as-is and left untouched by the form.
import type { Repeat, RepeatUnit } from '#lib/core/tasks.js';
import { FREQ_OF_UNIT as FREQ, UNIT_OF_FREQ as UNIT_OF, plural, simpleRule } from './rrule-form.js';

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
	const simple = simpleRule(repeat.rrule);
	if (!simple) return { kind: 'custom', every: 1, unit: 'week' };
	return { kind: 'fixed', every: simple.interval, unit: UNIT_OF[simple.freq] as RepeatUnit };
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

const word = (n: number, unit: RepeatUnit) => plural(n, WORDS[unit]);

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
