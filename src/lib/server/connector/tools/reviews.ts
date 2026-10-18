import { z } from 'zod';
import { reply, type RegisterTools } from './support.js';

const period = z
	.enum(['week', 'month'])
	.describe(
		'"week" = ISO week (Monday to Sunday), "month" = calendar month; both in the owner\'s Home time zone (Europe/Istanbul)'
	);
const date = z
	.string()
	.optional()
	.describe('Any local date YYYY-MM-DD inside the wanted period. Defaults to today, i.e. the current week/month.');

export const registerReviewTools: RegisterTools = (server, { planner, actor }) => {
	server.registerTool(
		'get_review_data',
		{
			description:
				'Everything needed to write a weekly or monthly Review draft, in ONE call. Call this first, then save the draft with create_review (or update_review if the result\'s "review" field is not null). ' +
				'Returns: period {type,start,end}; tasks.done (Tasks completed inside the period); ' +
				'tasks.slipped (SLIPPED = Tasks still open whose due date is inside the period and already before today; Tasks completed later, without a due date, or due outside the period are not included); ' +
				'habits (active Habits, each with periods = its own ISO weeks / months that ended inside the review period, hitRate = percent of those met or null if none could be judged, checkins = dates inside the period, streak as of the period end; ' +
				'for a month review a weekly Habit is judged over the ISO weeks that END in that month); ' +
				'goals (progress of active Goals as of now: milestones done/total, linked Tasks and Habits); ' +
				'review (the Review already saved for this period, or null). Content is returned as the owner wrote it (often Russian). The owner reads Reviews in Russian, so write the draft in Russian unless asked otherwise.',
			inputSchema: z.object({ period, date })
		},
		reply(({ period, date }) => planner.reviewData({ period, date }))
	);

	server.registerTool(
		'create_review',
		{
			description:
				'Save a new Review for a period (one Review per week/month; an error names the existing one if there is already one: use update_review then). `draft` is Markdown, usually written from get_review_data; `reflection` is the owner\'s own text and normally stays empty. Returns the Review.',
			inputSchema: z.object({
				period,
				date,
				draft: z.string().optional().describe('Markdown draft'),
				reflection: z.string().optional().describe("Markdown; the owner's own reflection")
			})
		},
		reply((args) => planner.createReview(actor, args))
	);

	server.registerTool(
		'update_review',
		{
			description:
				'Change the draft and/or the reflection of a Review (fields left out are kept as they are). Use it to write the owner\'s reflection after a conversational review. Returns the Review.',
			inputSchema: z.object({
				id: z.number().int().describe('Review id from list_reviews, get_review_data or create_review'),
				draft: z.string().optional().describe('Markdown draft (replaces the whole draft)'),
				reflection: z.string().optional().describe('Markdown reflection (replaces the whole reflection)')
			})
		},
		reply(({ id, ...patch }) => planner.updateReview(actor, id, patch))
	);

	server.registerTool(
		'get_review',
		{ description: 'Get one Review (draft and reflection) by id.', inputSchema: z.object({ id: z.number().int() }) },
		reply(({ id }) => planner.getReview(id))
	);

	server.registerTool(
		'list_reviews',
		{
			description: 'List saved Reviews, newest period first. Optionally only weekly or only monthly ones. Delete one with delete_item (type "review").',
			inputSchema: z.object({ period: period.optional() })
		},
		reply(({ period }) => planner.listReviews({ period }))
	);
};
