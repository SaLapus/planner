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
});
