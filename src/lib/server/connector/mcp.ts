/**
 * The `/mcp` resource: Streamable HTTP via the official MCP SDK (stateless, one server per
 * request), behind a bearer-token gate that answers 401 with a pointer to the metadata.
 * Every call runs in the core as Actor `claude`.
 */
import {
	McpServer,
	createMcpHandler,
	requireBearerAuth,
	OAuthError,
	OAuthErrorCode
} from '@modelcontextprotocol/server';
import type { Planner } from '#lib/core/index.js';
import type { OAuthServer } from './oauth.js';
import { toolModules } from './tools/index.js';

export function createMcpEndpoint({ planner, oauth }: { planner: Planner; oauth: OAuthServer }) {
	const handler = createMcpHandler(() => {
		const server = new McpServer({ name: 'planner', version: '0.1.0' });
		for (const register of toolModules) register(server, { planner, actor: 'claude' });
		return server;
	});

	const gate = requireBearerAuth({
		verifier: {
			async verifyAccessToken(token) {
				const verified = oauth.verifyAccessToken(token);
				if (!verified) {
					throw new OAuthError(OAuthErrorCode.InvalidToken, 'Unknown, expired or revoked token');
				}
				return { token, ...verified, resource: new URL(oauth.resource) };
			}
		},
		expectedResource: new URL(oauth.resource),
		resourceMetadataUrl: oauth.resourceMetadataUrl
	});

	return async (request: Request): Promise<Response> => {
		const auth = await gate(request);
		if (auth instanceof Response) return auth;
		return handler.fetch(request, { authInfo: auth });
	};
}
