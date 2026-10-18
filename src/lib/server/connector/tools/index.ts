/**
 * Registry of MCP tool modules, one per entity area. To add tools for a new area:
 * create `tools/<area>.ts` exporting a `RegisterTools`, then add ONE line below
 * (an import and an array entry; keep one entry per line to merge cleanly).
 */
import type { RegisterTools } from './support.js';
import { registerTaskTools } from './tasks.js';

export const toolModules: RegisterTools[] = [
	registerTaskTools
];
