import { describe, expect, it } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runBackup } from '../../../scripts/backup.mjs';

function tmp() {
	return mkdtempSync(join(tmpdir(), 'planner-backup-'));
}

function makeDb(dir: string) {
	const path = join(dir, 'planner.db');
	const db = new DatabaseSync(path);
	db.exec('PRAGMA journal_mode=WAL; CREATE TABLE t(id INTEGER PRIMARY KEY, v TEXT)');
	return { db, path };
}

describe('runBackup', () => {
	it('writes a timestamped standalone copy that holds the data, including WAL-only writes', async () => {
		const dir = tmp();
		const { db, path } = makeDb(dir);
		db.prepare('INSERT INTO t(v) VALUES (?)').run('hello');
		const out = join(dir, 'backups');
		const file = await runBackup({ dbPath: path, backupDir: out, now: new Date('2026-10-18T03:00:05Z') });
		expect(file).toBe(join(out, 'planner-20261018-030005.db'));
		db.close();
		const copy = new DatabaseSync(file, { readOnly: true });
		expect(copy.prepare('SELECT v FROM t').all().map((r) => r.v)).toEqual(['hello']);
		expect(copy.prepare('PRAGMA integrity_check').get()).toEqual({ integrity_check: 'ok' });
		copy.close();
	});

	it('keeps only the newest 7 backups and leaves other files alone', async () => {
		const dir = tmp();
		const { db, path } = makeDb(dir);
		const out = join(dir, 'backups');
		for (let day = 1; day <= 9; day++) {
			await runBackup({ dbPath: path, backupDir: out, now: new Date(Date.UTC(2026, 9, day, 3)) });
		}
		writeFileSync(join(out, 'notes.txt'), 'keep me');
		await runBackup({ dbPath: path, backupDir: out, now: new Date(Date.UTC(2026, 9, 10, 3)) });
		db.close();
		const names = readdirSync(out).sort();
		expect(names).toEqual([
			'notes.txt',
			...[4, 5, 6, 7, 8, 9, 10].map((d) => `planner-202610${String(d).padStart(2, '0')}-030000.db`)
		]);
	}, 30_000);

	it('is consistent while another connection keeps writing', async () => {
		const dir = tmp();
		const { db, path } = makeDb(dir);
		for (let i = 0; i < 2000; i++) db.prepare('INSERT INTO t(v) VALUES (?)').run('x'.repeat(200));
		const writer = setInterval(() => db.prepare('INSERT INTO t(v) VALUES (?)').run('live'), 0);
		const file = await runBackup({ dbPath: path, backupDir: join(dir, 'b'), now: new Date() });
		clearInterval(writer);
		db.close();
		const copy = new DatabaseSync(file, { readOnly: true });
		expect(copy.prepare('PRAGMA integrity_check').get()).toEqual({ integrity_check: 'ok' });
		expect(Number(copy.prepare('SELECT count(*) AS n FROM t').get()!.n)).toBeGreaterThanOrEqual(2000);
		copy.close();
	});

	it('fails when the database does not exist, without creating an empty one', async () => {
		const dir = tmp();
		await expect(
			runBackup({ dbPath: join(dir, 'nope.db'), backupDir: join(dir, 'b'), now: new Date() })
		).rejects.toThrow();
		expect(readdirSync(dir)).toEqual([]);
	});
});
