/**
 * The Claude connector: OAuth authorization server + `/mcp` endpoint.
 * `handle(request)` answers connector paths (`/mcp`, `/oauth/*`, `/.well-known/*`) and
 * returns undefined for everything else, so hooks.server.ts (and the contract-test harness)
 * can call it first and fall through to normal routing.
 */
import type { DatabaseSync } from 'node:sqlite';
import type { Clock, Planner } from '#lib/core/index.js';
import { createOAuthServer } from './oauth.js';
import { createMcpEndpoint } from './mcp.js';

export interface ConnectorDeps {
	planner: Planner;
	/** Same database as the core; OAuth clients and tokens live in their own tables. */
	db: DatabaseSync;
	clock: Clock;
	publicUrl: string;
	/** True when the request has a valid owner session (from the auth module). */
	isOwner(request: Request): boolean;
}

export function createConnector({ planner, db, clock, publicUrl, isOwner }: ConnectorDeps) {
	const oauth = createOAuthServer({ db, clock, publicUrl, isOwner });
	const mcp = createMcpEndpoint({ planner, oauth });
	return {
		async handle(request: Request): Promise<Response | undefined> {
			if (new URL(request.url).pathname === '/mcp') return mcp(request);
			return oauth.handle(request);
		}
	};
}

export type Connector = ReturnType<typeof createConnector>;
