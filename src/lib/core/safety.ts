/**
 * The shared safety net: soft delete (Trash), restore, purge and undo. It knows nothing about
 * individual entities; each entity area registers an `EntityKind` (see context.ts) and gets all
 * of it for free.
 */
import type { Actor, CoreContext } from './context.js';
import {
	getChangeEntry,
	laterChangeEntry,
	lastChangeEntry,
	type ChangeLogEntry
} from './changelog.js';

export interface TrashItem {
	entityType: string;
	entityId: number;
	label: string;
	deletedAt: string;
	/** When the Clock will let `purgeTrash` remove it for good. */
	purgeAt: string;
	snapshot: unknown;
}

export interface SafetyApi {
	/** Entity types that can be deleted/restored/undone. */
	trashableTypes(): string[];
	/** Soft delete: the entity leaves its normal lists and its snapshot waits in Trash. */
	deleteItem(actor: Actor, entityType: string, id: number): void;
	restoreItem(actor: Actor, entityType: string, id: number): void;
	/** Newest first. */
	listTrash(): TrashItem[];
	/** Permanently remove items older than the retention. Returns how many. Not logged (housekeeping). */
	purgeTrash(): number;
	/**
	 * Revert one change-log entry (create, update, complete, delete, restore, ...). Throws
	 * `Cannot undo change #N: <reason>` if the entity changed after that entry. Logs its own
	 * entry (so an undo can be undone) and returns it.
	 */
	undoChange(actor: Actor, changeId: number): ChangeLogEntry;
	/** Why `undoChange` would refuse right now, or null if it would work. */
	undoBlockedReason(changeId: number): string | null;
}

interface TrashRow {
	entity_type: string;
	entity_id: number;
	deleted_at: string;
	snapshot: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Same JSON regardless of key order, so snapshots compare reliably. */
const canonical = (v: unknown): string =>
	JSON.stringify(v, (_k, x) =>
		x && typeof x === 'object' && !Array.isArray(x)
			? Object.fromEntries(Object.entries(x).sort(([p], [q]) => (p < q ? -1 : 1)))
			: x
	);

export function safetyModule(ctx: CoreContext): SafetyApi {
	const { db, entities, clock, nowIso, atomically, record } = ctx;
	const retentionMs = (ctx.trashRetentionDays ?? 30) * DAY_MS;

	function kindOf(type: string) {
		const kind = entities.get(type);
		if (!kind) throw new Error(`Unknown entity type "${type}"`);
		return kind;
	}
	const labelOf = (type: string, snapshot: { id: number }) =>
		entities.get(type)?.label?.(snapshot) ?? `${type} #${snapshot.id}`;
	const trashRow = (type: string, id: number) =>
		db.prepare('SELECT * FROM trash WHERE entity_type = ? AND entity_id = ?').get(type, id) as
			| TrashRow
			| undefined;

	// Delete and restore as internal steps. `action` is a parameter so that undo can log the
	// same step as '<original action>.undo'. Callers wrap them in `atomically`.
	function softDelete(actor: Actor, action: string, type: string, id: number) {
		const kind = kindOf(type);
		const snapshot = kind.read(id);
		if (!snapshot) throw new Error(`${type} ${id} not found`);
		kind.remove(id);
		db.prepare(
			'INSERT OR REPLACE INTO trash (entity_type, entity_id, deleted_at, snapshot) VALUES (?, ?, ?, ?)'
		).run(type, id, nowIso(), JSON.stringify(snapshot));
		record(actor, action, type, id, snapshot, null);
	}

	function restore(actor: Actor, action: string, type: string, id: number) {
		const kind = kindOf(type);
		const row = trashRow(type, id);
		if (!row) throw new Error(`${type} ${id} is not in Trash`);
		const snapshot = JSON.parse(row.snapshot);
		kind.write(snapshot);
		db.prepare('DELETE FROM trash WHERE entity_type = ? AND entity_id = ?').run(type, id);
		record(actor, action, type, id, null, snapshot);
	}

	/** null = the entry can be undone now; otherwise the reason it cannot. */
	function blockedReason(entry: ChangeLogEntry): string | null {
		const kind = entities.get(entry.entityType);
		if (!kind) return `unknown entity type "${entry.entityType}"`;
		const name = `${entry.entityType} ${entry.entityId}`;
		const current = kind.read(entry.entityId);
		if (entry.after === null) {
			// The entry removed the entity: undoing it means taking it out of Trash.
			if (current) return `${name} exists again (it was already restored)`;
			if (!trashRow(entry.entityType, entry.entityId)) {
				return `${name} is no longer in Trash (purged)`;
			}
			return null;
		}
		// Otherwise the entity must still be exactly as this entry left it.
		const view = (s: unknown) => (kind.comparable ? kind.comparable(s as { id: number }) : s);
		if (!current || canonical(view(current)) !== canonical(view(entry.after))) {
			const later = laterChangeEntry(db, entry.entityType, entry.entityId, entry.id);
			return `${name} changed after this entry${later ? ` (change #${later.id}, ${later.action})` : ''}`;
		}
		return null;
	}

	return {
		trashableTypes: () => entities.types(),
		deleteItem: (actor, type, id) =>
			void atomically(() => softDelete(actor, `${type}.delete`, type, id)),
		restoreItem: (actor, type, id) =>
			void atomically(() => restore(actor, `${type}.restore`, type, id)),
		listTrash() {
			const rows = db.prepare('SELECT * FROM trash ORDER BY id DESC').all() as unknown as TrashRow[];
			return rows.map((r) => {
				const snapshot = JSON.parse(r.snapshot);
				return {
					entityType: r.entity_type,
					entityId: r.entity_id,
					label: labelOf(r.entity_type, snapshot),
					deletedAt: r.deleted_at,
					purgeAt: new Date(Date.parse(r.deleted_at) + retentionMs).toISOString(),
					snapshot
				};
			});
		},
		purgeTrash() {
			const cutoff = new Date(clock.now().getTime() - retentionMs).toISOString();
			const { changes } = db.prepare('DELETE FROM trash WHERE deleted_at <= ?').run(cutoff);
			return Number(changes);
		},
		undoBlockedReason(changeId) {
			const entry = getChangeEntry(db, changeId);
			return entry ? blockedReason(entry) : `change #${changeId} not found`;
		},
		undoChange(actor, changeId) {
			return atomically(() => {
				const entry = getChangeEntry(db, changeId);
				if (!entry) throw new Error(`Change #${changeId} not found`);
				const reason = blockedReason(entry);
				if (reason) throw new Error(`Cannot undo change #${changeId}: ${reason}`);
				const { entityType: type, entityId: id } = entry;
				const action = `${entry.action}.undo`;
				if (entry.after === null) restore(actor, action, type, id);
				else if (entry.before === null) softDelete(actor, action, type, id);
				else {
					const kind = kindOf(type);
					const current = kind.read(id);
					kind.write(entry.before as { id: number });
					record(actor, action, type, id, current, entry.before);
				}
				return lastChangeEntry(db);
			});
		}
	};
}
