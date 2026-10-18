// GET /feed/<secret>.ics: the public Calendar feed (hooks.server.ts lets /feed/ past the login).
import { feedResponse } from '#lib/server/feed.js';
import { getPlanner } from '#lib/server/planner.js';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ params }) => feedResponse(getPlanner(), params.file);
