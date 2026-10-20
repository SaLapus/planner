import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createPlanner } from './index.js';
import { openDatabase } from './database.js';
import { createFakeClock } from './testing/harness.js';

let dir: string;
beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), 'planner-'));
});
afterEach(() => {
	rmSync(dir, { recursive: true, force: true });
});

describe('file database', () => {
	it('uses WAL mode and keeps tasks across reopen', () => {
		const file = join(dir, 'sub', 'planner.db');
		const clock = createFakeClock();

		const db1 = openDatabase(file);
		expect((db1.prepare('PRAGMA journal_mode').get() as { journal_mode: string }).journal_mode).toBe(
			'wal'
		);
		createPlanner({ db: db1, clock, homeTimeZone: 'Europe/Istanbul' }).createTask('owner', {
			title: 'persist me'
		});
		db1.close();

		const db2 = openDatabase(file);
		const planner = createPlanner({ db: db2, clock, homeTimeZone: 'Europe/Istanbul' });
		expect(planner.listTasks().map((t) => t.title)).toEqual(['persist me']);
		db2.close();
	});

	it('backfills the Start date once when upgrading, without change-log entries', () => {
		const file = join(dir, 'old.db');
		const clock = createFakeClock();
		const home = 'Europe/Istanbul';

		// Build a database as it was before the Start date: migrate fully, then take the column away.
		const db1 = openDatabase(file);
		createPlanner({ db: db1, clock, homeTimeZone: home });
		const version = (db1.prepare('PRAGMA user_version').get() as { user_version: number }).user_version;
		db1.exec('ALTER TABLE task DROP COLUMN start_date');
		db1.exec(`PRAGMA user_version = ${version - 2}`);
		const insert = db1.prepare('INSERT INTO task (title, created_at, due_date) VALUES (?, ?, ?)');
		insert.run('due before creation', '2026-01-05T22:30:00.000Z', '2026-01-03'); // Home day 2026-01-06
		insert.run('due after creation', '2026-01-05T22:30:00.000Z', '2026-02-01');
		insert.run('no due', '2026-01-05T22:30:00.000Z', null);
		db1.close();

		const db2 = openDatabase(file);
		const planner = createPlanner({ db: db2, clock, homeTimeZone: home });
		expect(planner.listTasks().map((t) => [t.title, t.startDate])).toEqual([
			['due before creation', '2026-01-03'],
			['due after creation', '2026-01-06'],
			['no due', '2026-01-06']
		]);
		expect(planner.changeLog()).toEqual([]);
		db2.close();

		// Reopening does not run the backfill again.
		const db3 = openDatabase(file);
		db3.prepare("UPDATE task SET start_date = '2026-01-20' WHERE title = 'no due'").run();
		const again = createPlanner({ db: db3, clock, homeTimeZone: home });
		expect(again.listTasks().find((t) => t.title === 'no due')!.startDate).toBe('2026-01-20');
		db3.close();
	});
});
