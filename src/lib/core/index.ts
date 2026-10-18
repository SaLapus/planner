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
import { organisingModule, type OrganisingApi } from './organising.js';
import { changeLogModule, type ChangeLogQueries } from './changelog.js';
import { safetyModule, type SafetyApi } from './safety.js';

import { eventModule, type EventApi } from './events.js';
import { goalModule, type GoalApi } from './goals.js';
import { agendaModule, type AgendaApi } from './agenda.js';
import { statsModule, type StatsApi } from './stats.js';
import { feedModule, type FeedApi } from './feed.js';

export type { Actor, Clock, PlannerDeps } from './context.js';
export type { Task, Subtask, TaskFilter, Priority, TaskList, TimeBlock, TimeBlockInput } from './tasks.js';
export type { Project, TagCount } from './organising.js';
export type { Event, EventInput, EventAgendaItem, OccurrenceOverride, OccurrencePatch } from './events.js';
export type { AgendaItem, TaskAgendaItem } from './agenda.js';
export type { ChangeLogEntry } from './changelog.js';
export type { Habit, Checkin, HabitSchedule, HabitStatus, PeriodType } from './habits.js';
export type { TrashItem } from './safety.js';
export type { Goal, GoalStatus, GoalWithMilestones, Milestone, GoalProgress } from './goals.js';
export type { Stats, HabitHitRate, HabitPeriodStat, WeekCount } from './stats.js';

export interface Planner
	extends TaskApi,
		OrganisingApi,
		Omit<EventApi, 'agenda'>,
		AgendaApi,
		HabitApi,
		GoalApi,
		StatsApi,
		FeedApi,
		ChangeLogQueries,
		SafetyApi {}

export function createPlanner(deps: PlannerDeps): Planner {
	migrate(deps.db);
	const ctx = createContext(deps);
	const habits = habitModule(ctx);
	const goals = goalModule(ctx, habits);
	const { agenda: eventAgenda, ...events } = eventModule(ctx);
	return {
		...taskModule(ctx),
		...organisingModule(ctx),
		...events,
		// The merged agenda: Events (their own source) plus Tasks. See agenda.ts.
		...agendaModule(ctx, eventAgenda),
		...habits,
		...goals,
		...statsModule(ctx, habits, goals),
		...changeLogModule(ctx),
		...feedModule(ctx, events),
		...safetyModule(ctx)
	};
}
