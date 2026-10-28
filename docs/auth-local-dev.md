# Owner login: local development

The Planner logs the owner in through Pocket ID (passkeys). Locally you run a throwaway Pocket ID next to the app.

## 1. Start a local Pocket ID

```
docker compose -f docker-compose.dev.yml up -d
```

It listens on http://localhost:1411 (passkeys work on `localhost` without HTTPS). Data lives in the Docker volume `pocket_id_dev_data`; wipe everything with `docker compose -f docker-compose.dev.yml down -v`.

## 2. Create your account and the Planner client (once)

1. Open http://localhost:1411/setup, fill in name/username/email and register a passkey.
2. In Pocket ID: **Administration -> OIDC Clients -> Add**. Name `Planner`, callback URL exactly `http://localhost:5173/auth/callback`. Save, then note the **Client ID** and generate the **Client Secret**.
3. Your **subject** is your Pocket ID user ID: **Administration -> Users -> your user**; it is the UUID in the page address (`/settings/admin/users/<uuid>`).

## 3. Configure the Planner

Create `.env` in the repo root (git-ignored; real environment variables win over it):

```
PLANNER_URL=http://localhost:5173
OIDC_ISSUER=http://localhost:1411
OIDC_CLIENT_ID=<client id>
OIDC_CLIENT_SECRET=<client secret>
OWNER_SUBJECT=<your user id>
SESSION_SECRET=<at least 32 random characters, e.g. openssl rand -base64 32>
```

In production the same variables are real environment variables (`PLANNER_URL=https://plan.<domain>`, `OIDC_ISSUER=https://id.<domain>`, callback URL `https://plan.<domain>/auth/callback`).

## 4. Run

```
pnpm dev
```

Open http://localhost:5173. You are redirected to Pocket ID, log in with your passkey, and land back in the Planner.

## How it behaves

- Only the account whose ID equals `OWNER_SUBJECT` gets in; any other Pocket ID account lands on `/auth/denied`.
- The session is a signed, http-only cookie (`Secure` automatically when `PLANNER_URL` is https), valid 90 days. Logout (button on the main page) clears it. Because it is stateless, there is no server-side revoke: to invalidate every session, change `SESSION_SECRET`; to change who may enter, change `OWNER_SUBJECT`.
- Every page and `/api/*` route requires the session (`/api/*` answers 401 instead of redirecting). UI requests run in the core as Actor `owner`.
- Tests build the auth with `createAuth({ config, fetch, clock })` (see `src/lib/server/auth/auth.test.ts` and `testing/fake-idp.ts`); later MCP contract tests can do the same with a test config.
