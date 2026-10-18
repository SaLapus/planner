import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

/** Open (creating if needed) the SQLite file the app persists to, in WAL mode. */
export function openDatabase(file: string): DatabaseSync {
	mkdirSync(dirname(file), { recursive: true });
	const db = new DatabaseSync(file);
	db.exec('PRAGMA journal_mode = WAL');
	db.exec('PRAGMA synchronous = NORMAL');
	db.exec('PRAGMA foreign_keys = ON');
	db.exec('PRAGMA busy_timeout = 5000');
	return db;
}
