// End-to-end check of the Claude connector against a RUNNING Planner (pnpm dev), without a browser:
// dynamic client registration -> authorize (owner session) -> PKCE token -> refresh -> MCP tool calls.
//
//   node --env-file=.env scripts/connector-e2e.mjs        (run inside planner/)
//
// It needs PLANNER_URL and SESSION_SECRET (the same values the server uses): the owner session
// cookie is signed locally, standing in for the Pocket ID login that a human would do.
import { createHash, createHmac, randomBytes } from 'node:crypto';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';

const base = process.env.PLANNER_URL;
const secret = process.env.SESSION_SECRET;
if (!base || !secret) throw new Error('Set PLANNER_URL and SESSION_SECRET (e.g. node --env-file=.env ...)');

const body = Buffer.from(JSON.stringify({ sub: process.env.OWNER_SUBJECT, exp: Date.now() + 3600_000 })).toString('base64url');
const cookie = `planner_session=${body}.${createHmac('sha256', secret).update(body).digest('base64url')}`;
const redirectUri = 'http://localhost:33418/callback';
const step = (msg) => console.log('OK  ' + msg);
const must = (cond, msg) => {
	if (!cond) throw new Error('FAIL ' + msg);
};

const unauth = await fetch(`${base}/mcp`, {
	method: 'POST',
	headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
	body: '{}'
});
must(unauth.status === 401 && /resource_metadata=/.test(unauth.headers.get('www-authenticate') ?? ''), `unauthenticated /mcp -> 401 + metadata pointer (got ${unauth.status})`);
step('unauthenticated /mcp -> 401 with resource_metadata');

const prm = await (await fetch(`${base}/.well-known/oauth-protected-resource/mcp`)).json();
const asm = await (await fetch(`${base}/.well-known/oauth-authorization-server`)).json();
must(prm.authorization_servers?.length && asm.code_challenge_methods_supported?.includes('S256'), 'metadata');
step('protected-resource + authorization-server metadata');

const reg = await fetch(asm.registration_endpoint, {
	method: 'POST',
	headers: { 'content-type': 'application/json' },
	body: JSON.stringify({ client_name: 'e2e-script', redirect_uris: [redirectUri], token_endpoint_auth_method: 'none' })
});
must(reg.status === 201, `DCR (got ${reg.status})`);
const { client_id } = await reg.json();
step('dynamic client registration');

const verifier = randomBytes(32).toString('base64url');
const params = {
	response_type: 'code',
	client_id,
	redirect_uri: redirectUri,
	code_challenge: createHash('sha256').update(verifier).digest('base64url'),
	code_challenge_method: 'S256',
	state: 'st',
	resource: prm.resource
};
const anon = await fetch(`${asm.authorization_endpoint}?${new URLSearchParams(params)}`, { redirect: 'manual' });
must(anon.status === 302 && anon.headers.get('location').startsWith('/auth/login'), `authorize without session -> login (got ${anon.status})`);
step('authorize without owner session redirects to login');

const consent = await fetch(`${asm.authorization_endpoint}?${new URLSearchParams(params)}`, { headers: { cookie }, redirect: 'manual' });
must(consent.status === 200 && (await consent.text()).includes('e2e-script'), 'consent page');
step('authorize with owner session shows consent');

const allow = await fetch(asm.authorization_endpoint, {
	method: 'POST',
	headers: { cookie, 'content-type': 'application/x-www-form-urlencoded', origin: new URL(base).origin },
	body: new URLSearchParams({ ...params, decision: 'allow' }),
	redirect: 'manual'
});
const code = new URL(allow.headers.get('location') ?? 'x:').searchParams.get('code');
must(allow.status === 302 && code, `consent POST issues a code (got ${allow.status})`);
step('consent POST -> redirect with code');

const tokenRes = await fetch(asm.token_endpoint, {
	method: 'POST',
	headers: { 'content-type': 'application/x-www-form-urlencoded' },
	body: new URLSearchParams({ grant_type: 'authorization_code', code, client_id, redirect_uri: redirectUri, code_verifier: verifier, resource: prm.resource })
});
must(tokenRes.status === 200, `token exchange (got ${tokenRes.status} ${await tokenRes.clone().text()})`);
let tokens = await tokenRes.json();
step('authorization_code + PKCE -> tokens');

const refreshed = await fetch(asm.token_endpoint, {
	method: 'POST',
	headers: { 'content-type': 'application/x-www-form-urlencoded' },
	body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: tokens.refresh_token, client_id })
});
must(refreshed.status === 200, `refresh (got ${refreshed.status})`);
tokens = await refreshed.json();
step('refresh_token grant (rotation)');

const client = new Client({ name: 'e2e', version: '1' });
await client.connect(new StreamableHTTPClientTransport(new URL(prm.resource), { requestInit: { headers: { authorization: `Bearer ${tokens.access_token}` } } }));
const tools = (await client.listTools()).tools.map((t) => t.name);
must(tools.includes('create_task'), 'tools listed');
step('MCP tools: ' + tools.join(', '));
const created = await client.callTool({ name: 'create_task', arguments: { title: `e2e ${new Date().toISOString()}` } });
console.log('    create_task ->', created.content[0].text);
step('create_task via MCP (check the UI: change log actor is claude)');
await client.close();
