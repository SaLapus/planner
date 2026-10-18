/**
 * Planner core: the single deep module that owns all domain rules and
 * persistence. UI routes and MCP tools are thin adapters that call
 * this interface; they contain no domain logic.
 *
 * Rules every command follows:
 *  - takes an Actor as its first argument;
 *  - never reads system time (uses the injected Clock);
 *  - writes exactly one change-log entry, in the same transaction as the mutation.
 *
 * The implementation is split by entity area (`tasks.ts`, `changelog.ts`, ...). To add an
 * area: create `core/<area>.ts` exporting an `<Area>Api` interface and a `<area>Module(ctx)`
 * factory, then add one line to `Planner` and one to `createPlanner` below.
 */
import { migrate } from './schema.js';
import { createContext, type PlannerDeps } from './context.js';
import { taskModule, type TaskApi } from './tasks.js';
import { habitModule, type HabitApi } from './habits.js';
import { changeLogModule, type ChangeLogQueries } from './changelog.js';

export type { Actor, Clock, PlannerDeps } from './context.js';
export type { Task } from './tasks.js';
export type { ChangeLogEntry } from './changelog.js';
export type { Habit, Checkin, HabitSchedule, HabitStatus, PeriodType } from './habits.js';

export interface Planner extends TaskApi, HabitApi, ChangeLogQueries {}

export function createPlanner(deps: PlannerDeps): Planner {
	migrate(deps.db);
	const ctx = createContext(deps);
	return {
		...taskModule(ctx),
		...habitModule(ctx),
		...changeLogModule(ctx)
	};
}
