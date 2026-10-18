import type { McpServer } from '@modelcontextprotocol/server';
import type { Actor, Planner } from '#lib/core/index.js';

/** What every tool module receives. `actor` is always 'claude' for MCP calls. */
export interface ToolContext {
	planner: Planner;
	actor: Actor;
}

export type RegisterTools = (server: McpServer, ctx: ToolContext) => void;

type ToolResult = { content: { type: 'text'; text: string }[]; isError?: boolean };

/**
 * Wraps a tool body: its return value is sent to Claude as one JSON text block, and a thrown
 * Error (a core rule violation such as "Task 3 not found") becomes an `isError` result that
 * Claude can read and react to, instead of a protocol failure.
 */
export function reply<A>(body: (args: A) => unknown): (args: A) => Promise<ToolResult> {
	return async (args) => {
		try {
			return { content: [{ type: 'text', text: JSON.stringify(body(args)) }] };
		} catch (e) {
			return {
				content: [{ type: 'text', text: e instanceof Error ? e.message : String(e) }],
				isError: true
			};
		}
	};
}
