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
	// Task scheduling: due date (local Home date), optional due time (Home wall clock), priority.
	`
	ALTER TABLE task ADD COLUMN due_date TEXT;
	ALTER TABLE task ADD COLUMN due_time TEXT;
	ALTER TABLE task ADD COLUMN priority TEXT NOT NULL DEFAULT 'none';
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
	`,
	// Trash: one row per soft-deleted entity, holding its full snapshot until restored or purged.
	`
	CREATE TABLE trash (
		id          INTEGER PRIMARY KEY AUTOINCREMENT,
		entity_type TEXT NOT NULL,
		entity_id   INTEGER NOT NULL,
		deleted_at  TEXT NOT NULL,
		snapshot    TEXT NOT NULL,
		UNIQUE (entity_type, entity_id)
	);
	`,
	// One-off Events (ticket #8). Deletion goes through the generic Trash, so no deleted_at.
	`
	CREATE TABLE event (
		id          INTEGER PRIMARY KEY AUTOINCREMENT,
		title       TEXT NOT NULL,
		notes       TEXT NOT NULL DEFAULT '',
		location    TEXT NOT NULL DEFAULT '',
		all_day     INTEGER NOT NULL,
		time_zone   TEXT NOT NULL,
		start_at    TEXT,
		end_at      TEXT,
		start_date  TEXT,
		end_date    TEXT,
		recurrence  TEXT,
		created_at  TEXT NOT NULL,
		updated_at  TEXT NOT NULL
	);
	`,
	// Habits and Check-ins (#12). Deleting is handled by the generic Trash (rows are removed, snapshot kept in `trash`).
	`
	CREATE TABLE habit (
		id          INTEGER PRIMARY KEY AUTOINCREMENT,
		title       TEXT NOT NULL,
		schedule    TEXT NOT NULL,
		archived_at TEXT,
		created_at  TEXT NOT NULL
	);
	CREATE TABLE habit_checkin (
		id         INTEGER PRIMARY KEY AUTOINCREMENT,
		habit_id   INTEGER NOT NULL REFERENCES habit(id),
		date       TEXT NOT NULL,
		created_at TEXT NOT NULL,
		UNIQUE (habit_id, date)
	);
	`,
	// Time block on a Task (ticket #9): start as a UTC instant plus a duration in minutes.
	`
	ALTER TABLE task ADD COLUMN block_start TEXT;
	ALTER TABLE task ADD COLUMN block_minutes INTEGER;
	`,
	// Goals and Milestones (#13). Links are plain id columns (no FOREIGN KEY): a link to a Goal/Milestone that is in
	// Trash just stays in the row, dormant, and works again when the target is restored.
	`
	CREATE TABLE goal (
		id          INTEGER PRIMARY KEY AUTOINCREMENT,
		title       TEXT NOT NULL,
		description TEXT NOT NULL DEFAULT '',
		status      TEXT NOT NULL DEFAULT 'active',
		target_date TEXT,
		created_at  TEXT NOT NULL
	);
	CREATE TABLE milestone (
		id          INTEGER PRIMARY KEY AUTOINCREMENT,
		goal_id     INTEGER NOT NULL,
		title       TEXT NOT NULL,
		target_date TEXT,
		done        INTEGER NOT NULL DEFAULT 0,
		position    INTEGER NOT NULL
	);
	ALTER TABLE task ADD COLUMN milestone_id INTEGER;
	ALTER TABLE habit ADD COLUMN goal_id INTEGER;
	`,
	// Recurring Events (ticket #10): per-occurrence changes (cancellations, edits) as JSON keyed by recurrenceId.
	`
	ALTER TABLE event ADD COLUMN overrides TEXT NOT NULL DEFAULT '{}';
	`,
	// Reviews (#14): one per (week|month, period start). Trash is generic (rows are removed, snapshot kept in `trash`).
	`
	CREATE TABLE review (
		id           INTEGER PRIMARY KEY AUTOINCREMENT,
		period_type  TEXT NOT NULL,
		period_start TEXT NOT NULL,
		draft        TEXT NOT NULL DEFAULT '',
		reflection   TEXT NOT NULL DEFAULT '',
		created_at   TEXT NOT NULL,
		updated_at   TEXT NOT NULL,
		UNIQUE (period_type, period_start)
	);
	`,
	// Repeating Tasks (ticket #11): repetition as JSON, plus the id of the next instance created on completion.
	`
	ALTER TABLE task ADD COLUMN repeat TEXT;
	ALTER TABLE task ADD COLUMN next_id INTEGER;
	`,
	// Calendar feed secret (ticket #15): one row; the value is random from the start (no "unset" state).
	`
	CREATE TABLE feed_secret (
		id     INTEGER PRIMARY KEY CHECK (id = 1),
		secret TEXT NOT NULL
	);
	INSERT INTO feed_secret (id, secret) VALUES (1, lower(hex(randomblob(32))));
	`,
	// "This and following" split as ONE change-log entry: the head keeps a snapshot of the new series (review S1).
	`
	ALTER TABLE event ADD COLUMN split_tail TEXT;
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
