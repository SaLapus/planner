# Connect Claude Code to the local Planner

The Planner serves an MCP endpoint at `/mcp` and is its own OAuth server (dynamic client registration, PKCE, refresh tokens). Authorising a client requires your owner session, i.e. the Pocket ID login from `docs/auth-local-dev.md`.

## Steps

1. Set up login and run the app as described in `docs/auth-local-dev.md` (`pnpm dev`, `planner/.env` with `PLANNER_URL=http://localhost:5173`).
2. Add the server:

   ```
   claude mcp add --transport http planner http://localhost:5173/mcp
   ```

3. In Claude Code run `/mcp`, pick `planner`, choose **Authenticate**. The browser opens the Planner: if you are not logged in you pass through Pocket ID (passkey), then a consent page "Allow access?" appears. Press **Allow**; the browser returns to Claude Code.
4. Ask Claude: "Add a task: купить молоко". Open http://localhost:5173: the Task is there, and the change log entry (database table `change_log`) has actor `claude`.

Tools: `create_task`, `list_tasks`, `complete_task`, `uncomplete_task`.

## Notes

- Access tokens last 1 hour; Claude Code refreshes them itself. Refresh tokens last 180 days and rotate on every use. Reusing an old refresh token revokes that whole login.
- Clients and tokens live in the Planner database (tables `oauth_client`, `oauth_token`, `oauth_code`), so backups include them. To revoke everything: delete the rows of `oauth_token`.
- On a server the same works with `https://plan.<domain>/mcp`. For claude.ai (web, then Android) add a custom connector with that URL; its callback `https://claude.ai/api/mcp/auth_callback` is accepted at registration.
- Without a browser you can exercise the same flow against a running dev server: `node --env-file=.env scripts/connector-e2e.mjs` in `planner/` (signs an owner cookie from `SESSION_SECRET`).
