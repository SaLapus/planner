/**
 * Registry of MCP tool modules, one per entity area. To add tools for a new area:
 * create `tools/<area>.ts` exporting a `RegisterTools`, then add ONE line below
 * (an import and an array entry; keep one entry per line to merge cleanly).
 */
import type { RegisterTools } from './support.js';
import { registerTaskTools } from './tasks.js';
import { registerOrganisingTools } from './organising.js';
import { registerSafetyTools } from './safety.js';
import { registerHabitTools } from './habits.js';
import { registerEventTools } from './events.js';
import { registerGoalTools } from './goals.js';
import { registerReviewTools } from './reviews.js';
import { registerStatsTools } from './stats.js';

export const toolModules: RegisterTools[] = [
	registerTaskTools,
	registerOrganisingTools,
	registerSafetyTools,
	registerEventTools,
	registerHabitTools,
	registerGoalTools,
	registerReviewTools,
	registerStatsTools
];
