import { z } from 'zod';
import { reply, type RegisterTools } from './support.js';

export const registerStatsTools: RegisterTools = (server, { planner }) => {
	server.registerTool(
		'get_stats',
		{
			description:
				'Trends for the stats page. habits: per active Habit its last N Periods (weeks, or months for per-month Habits; oldest first) ' +
				'with done/target/met and hitRate (% of closed Periods met). tasksPerWeek: Tasks completed per Monday-start week (Home time zone). ' +
				'goals: progress of active Goals. Defaults: 8 periods, 8 weeks (max 52).',
			inputSchema: z.object({ periods: z.number().int().optional(), weeks: z.number().int().optional() })
		},
		reply((args) => planner.stats(args))
	);
};
