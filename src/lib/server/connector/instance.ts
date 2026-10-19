/** Builds the real connector (real DB, system clock, owner check from the real Auth). */
import { getAuth } from '#lib/server/auth/instance.js';
import { getDatabase, getPlanner } from '#lib/server/planner.js';
import { createConnector, type Connector } from './index.js';

let instance: Connector | undefined;

export function getConnector(): Connector {
	instance ??= createConnector({
		planner: getPlanner(),
		db: getDatabase(),
		clock: { now: () => new Date() },
		publicUrl: process.env.PLANNER_URL!,
		isOwner: (request) => getAuth().isOwner(request)
	});
	return instance;
}
