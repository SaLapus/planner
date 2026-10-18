export function runBackup(o: {
	dbPath: string;
	backupDir: string;
	now?: Date;
	keep?: number;
}): Promise<string>;
