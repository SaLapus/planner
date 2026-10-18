// Nightly backup of the Planner database using a SQLite online snapshot (VACUUM INTO) (consistent while the app writes).
// In the container:  node backup.mjs   (PLANNER_DB and BACKUP_DIR come from the environment)
import { DatabaseSync } from 'node:sqlite';
import { existsSync, mkdirSync, readdirSync, renameSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const NAME = /^planner-\d{8}-\d{6}\.db$/;

function stamp(d) {
	const p = (n) => String(n).padStart(2, '0');
	return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}-${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}`;
}

/**
 * @param {{ dbPath: string, backupDir: string, now?: Date, keep?: number }} o
 * @returns {Promise<string>} path of the new backup
 */
export async function runBackup({ dbPath, backupDir, now = new Date(), keep = 7 }) {
	if (!existsSync(dbPath)) throw new Error(`database not found: ${dbPath}`);
	mkdirSync(backupDir, { recursive: true });
	const final = join(backupDir, `planner-${stamp(now)}.db`);
	const partial = `${final}.partial`;
	const db = new DatabaseSync(dbPath, { timeout: 5000 });
	try {
		// VACUUM INTO: a consistent snapshot taken inside one read transaction while the app keeps writing.
		// (node:sqlite's backup() hung on repeated calls inside Vitest workers.)
		rmSync(partial, { force: true });
		db.exec(`VACUUM INTO '${partial.replaceAll("'", "''")}'`);
	} catch (e) {
		rmSync(partial, { force: true });
		throw e;
	} finally {
		db.close();
	}
	renameSync(partial, final);
	const old = readdirSync(backupDir)
		.filter((n) => NAME.test(n))
		.sort()
		.slice(0, -keep);
	for (const n of old) rmSync(join(backupDir, n));
	return final;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	const file = await runBackup({
		dbPath: process.env.PLANNER_DB ?? '/data/planner.db',
		backupDir: process.env.BACKUP_DIR ?? '/backups'
	});
	console.log(`backup written: ${file}`);
}
