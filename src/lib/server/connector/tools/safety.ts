import { z } from 'zod';
import { reply, type RegisterTools } from './support.js';

/**
 * Generic safety-net tools. They work for EVERY entity type registered in the core, so a new
 * entity area gets delete/restore/undo over MCP without adding any tool here.
 */
export const registerSafetyTools: RegisterTools = (server, { planner, actor }) => {
	const types = planner.trashableTypes().join(', ');
	const entityType = z.string().describe(`Entity type, one of: ${types}`);

	server.registerTool(
		'delete_item',
		{
			description:
				'Delete an item by moving it to Trash (soft delete). It can be restored with restore_item for 30 days, then it is purged.',
			inputSchema: z.object({ type: entityType, id: z.number().int().describe('Item id') })
		},
		reply(({ type, id }) => {
			planner.deleteItem(actor, type, id);
			return { deleted: { type, id } };
		})
	);

	server.registerTool(
		'restore_item',
		{
			description: 'Restore an item from Trash (see list_trash). Fails if it is not in Trash.',
			inputSchema: z.object({ type: entityType, id: z.number().int().describe('Item id') })
		},
		reply(({ type, id }) => {
			planner.restoreItem(actor, type, id);
			return { restored: { type, id } };
		})
	);

	server.registerTool(
		'list_trash',
		{
			description: 'List items in Trash, newest first, with the time they will be purged for good.',
			inputSchema: z.object({})
		},
		reply(() => planner.listTrash())
	);

	server.registerTool(
		'list_changes',
		{
			description:
				'List the Change log, newest first: who (owner or claude) changed what, with before/after snapshots. Use an entry id with undo_change.',
			inputSchema: z.object({
				actor: z.enum(['owner', 'claude']).optional().describe('Only changes made by this actor'),
				limit: z.number().int().min(1).max(200).optional().describe('Default 50')
			})
		},
		reply(({ actor: who, limit }) =>
			planner
				.changeLog(who ? { actor: who } : undefined)
				.reverse()
				.slice(0, limit ?? 50)
		)
	);

	server.registerTool(
		'undo_change',
		{
			description:
				'Undo one Change log entry (create, update, complete, delete, restore). Refused with a reason if the item changed after that entry; undo the later entries first. Returns the new Change log entry.',
			inputSchema: z.object({ id: z.number().int().describe('Change log entry id from list_changes') })
		},
		reply(({ id }) => planner.undoChange(actor, id))
	);
};
