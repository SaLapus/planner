import type { DatabaseSync } from 'node:sqlite';

/**
 * Ordered, append-only list of migrations. To change the schema, add a new
 * entry at the END; never edit an existing one. `PRAGMA user_version` stores
 * how many have already been applied.
 */
const MIGRATIONS: string[] = [
	`
	CREATE TABLE task (
		id           INTEGER PRIMARY KEY AUTOINCREMENT,
		title        TEXT NOT NULL,
		completed_at TEXT,
		created_at   TEXT NOT NULL
	);
	CREATE TABLE change_log (
		id          INTEGER PRIMARY KEY AUTOINCREMENT,
		at          TEXT NOT NULL,
		actor       TEXT NOT NULL,
		action      TEXT NOT NULL,
		entity_type TEXT NOT NULL,
		entity_id   INTEGER NOT NULL,
		before      TEXT,
		after       TEXT
	);
	`,
	// Habits and Check-ins (#12). Soft delete via deleted_at.
	`
	CREATE TABLE habit (
		id          INTEGER PRIMARY KEY AUTOINCREMENT,
		title       TEXT NOT NULL,
		schedule    TEXT NOT NULL,
		archived_at TEXT,
		deleted_at  TEXT,
		created_at  TEXT NOT NULL
	);
	CREATE TABLE habit_checkin (
		id         INTEGER PRIMARY KEY AUTOINCREMENT,
		habit_id   INTEGER NOT NULL REFERENCES habit(id),
		date       TEXT NOT NULL,
		deleted_at TEXT,
		created_at TEXT NOT NULL
	);
	CREATE UNIQUE INDEX habit_checkin_active ON habit_checkin(habit_id, date) WHERE deleted_at IS NULL;
	`
];

export function migrate(db: DatabaseSync): void {
	const row = db.prepare('PRAGMA user_version').get() as { user_version: number };
	for (let v = row.user_version; v < MIGRATIONS.length; v++) {
		db.exec('BEGIN');
		try {
			db.exec(MIGRATIONS[v]);
			db.exec(`PRAGMA user_version = ${v + 1}`);
			db.exec('COMMIT');
		} catch (e) {
			db.exec('ROLLBACK');
			throw e;
		}
	}
}
