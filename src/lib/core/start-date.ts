/**
 * The Start date rules of a Task, stated once. Pure functions on Home-zone "YYYY-MM-DD" dates;
 * tasks.ts uses them for create, update and repeats, and schema.ts for the backfill migration.
 */

/**
 * The default Start date: the creation day in the Home time zone, or the due date if that is earlier.
 */
export function defaultStartDate(createdAt: string, dueDate: string | null, homeTimeZone: string): string {
	const created = Temporal.Instant.from(createdAt).toZonedDateTimeISO(homeTimeZone).toPlainDate().toString();
	return dueDate !== null && dueDate < created ? dueDate : created;
}

/** Validates Start date text (a plain date, like the date part of a due date). */
function parseStart(text: string): string {
	try {
		if (!/^\d{4}-\d{2}-\d{2}$/.test(text.trim())) throw new Error();
		return Temporal.PlainDate.from(text.trim(), { overflow: 'reject' }).toString();
	} catch {
		throw new Error(`Invalid start date "${text}" (use YYYY-MM-DD)`);
	}
}

/** A Start date never lies after the due date: a later one is pulled back to it. */
export function clampToDue(start: string, dueDate: string | null): string {
	return dueDate !== null && start > dueDate ? dueDate : start;
}

/**
 * The Start date of a Task being created or edited.
 * - `explicit` (text): validated; it may equal the due date but not come after it.
 * - otherwise `keep` (the Task's current Start date): kept, but pulled back to an earlier due date.
 * - otherwise the default rule, from `createdAt`.
 */
export function resolveStartDate(
	dueDate: string | null,
	homeTimeZone: string,
	from: { explicit: string } | { keep: string } | { createdAt: string }
): string {
	if ('explicit' in from) {
		const start = parseStart(from.explicit);
		if (dueDate !== null && start > dueDate) {
			throw new Error(`Start date ${start} is after the due date ${dueDate}`);
		}
		return start;
	}
	if ('keep' in from) return clampToDue(from.keep, dueDate);
	return defaultStartDate(from.createdAt, dueDate, homeTimeZone);
}
