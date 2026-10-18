// Server half of the stats page: one core call, no rules here.
import { getPlanner } from '#lib/server/planner.js';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = () => ({ stats: getPlanner().stats({ periods: 8, weeks: 8 }) });
