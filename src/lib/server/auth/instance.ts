/** Builds the real Auth (env config, real fetch, system clock). Tests build their own with createAuth. */
import { existsSync } from 'node:fs';
import { createAuth, type Auth } from './index.js';
import { loadAuthConfig } from './config.js';

// Dev convenience: read planner/.env if present (real environment variables win; production uses those).
if (existsSync('.env')) process.loadEnvFile('.env');

let instance: Auth | undefined;

export function getAuth(): Auth {
	instance ??= createAuth({
		config: loadAuthConfig(process.env),
		fetch,
		clock: { now: () => new Date() }
	});
	return instance;
}
