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
	// Projects, tags, subtasks (ticket #6)
	`
	CREATE TABLE project (
		id          INTEGER PRIMARY KEY AUTOINCREMENT,
		name        TEXT NOT NULL,
		archived_at TEXT,
		created_at  TEXT NOT NULL
	);
	ALTER TABLE task ADD COLUMN project_id INTEGER REFERENCES project(id);
	CREATE TABLE task_tag (
		task_id INTEGER NOT NULL REFERENCES task(id),
		tag     TEXT NOT NULL,
		PRIMARY KEY (task_id, tag)
	);
	CREATE INDEX task_tag_by_tag ON task_tag (tag);
	CREATE TABLE subtask (
		id       INTEGER PRIMARY KEY AUTOINCREMENT,
		task_id  INTEGER NOT NULL REFERENCES task(id),
		title    TEXT NOT NULL,
		done     INTEGER NOT NULL DEFAULT 0,
		position INTEGER NOT NULL
	);
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
