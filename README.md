# Planner

A self-hosted personal planner for one person: schedule (Events, recurring too), Tasks, Habits, Goals with
Milestones and weekly/monthly Reviews in one place. Claude can read and change it through a built-in MCP connector
(claude.ai web and Android, Claude Code, scheduled routines). Every change goes to a Change log with who made it and can
be undone; deletions go to a Trash. A read-only Calendar feed lets any calendar app subscribe.

SvelteKit + SQLite (Node's built-in `node:sqlite`, no native modules). Installable as a PWA. Russian UI.

**Limits today:** one owner per instance; the Home time zone is fixed to `Europe/Istanbul`
(`HOME_TIME_ZONE` in `src/lib/server/planner.ts`); the UI is Russian only.

## Run it yourself

The image is published on every push to `master`: `ghcr.io/salapus/planner:latest` (and `:sha-<commit>` to pin or
roll back).

You need:

- **HTTPS in front of it** (Caddy, Traefik, nginx, ...). The login cookie is `Secure`, passkeys and claude.ai need HTTPS.
  The image trusts `X-Forwarded-Proto/Host/For` from one proxy hop, so do not expose port 3000 to the internet directly.
- **An OIDC login provider** (Pocket ID, Authelia, Keycloak, Authentik, ...). Create a client with the callback URL
  `<PLANNER_URL>/auth/callback`. Only the one account whose subject equals `OWNER_SUBJECT` can log in.

### Environment variables

| Variable | Required | What |
|---|---|---|
| `PLANNER_URL` | yes | Public address, e.g. `https://plan.example.com` (no trailing slash). |
| `OIDC_ISSUER` | yes | Your provider's issuer URL (`<issuer>/.well-known/openid-configuration` must exist). |
| `OIDC_CLIENT_ID` | yes | Client ID from the provider. |
| `OIDC_CLIENT_SECRET` | yes | Client secret from the provider. |
| `OWNER_SUBJECT` | yes | The `sub` claim (user id) of the only account allowed in. |
| `SESSION_SECRET` | yes | At least 32 random characters: `openssl rand -base64 32`. Changing it logs every device out. |
| `PLANNER_DB` | no | SQLite file. Image default `/data/planner.db` (put a volume on `/data`). |
| `BACKUP_DIR` | no | Where `backup.mjs` writes copies. Image default `/backups`. |

### Minimal `compose.yaml`

```yaml
services:
  planner:
    image: ghcr.io/salapus/planner:latest
    restart: unless-stopped
    # Only your reverse proxy should reach this. If the proxy runs in the same Compose project,
    # drop `ports:` and point it at planner:3000.
    ports:
      - "127.0.0.1:3000:3000"
    environment:
      PLANNER_URL: https://plan.example.com
      OIDC_ISSUER: https://id.example.com
      OIDC_CLIENT_ID: ${OIDC_CLIENT_ID}
      OIDC_CLIENT_SECRET: ${OIDC_CLIENT_SECRET}
      OWNER_SUBJECT: ${OWNER_SUBJECT}
      SESSION_SECRET: ${SESSION_SECRET}
    volumes:
      - planner_data:/data
      - planner_backups:/backups

volumes:
  planner_data:
  planner_backups:
```

`docker compose up -d`, then open `PLANNER_URL`: you are sent to your provider, log in, and land on the task list.
Update: `docker compose pull && docker compose up -d` (the database on its volume stays).

### Backups

`docker compose exec -T planner node backup.mjs` takes a consistent copy with SQLite's `VACUUM INTO` while the app keeps
running, writes `/backups/planner-YYYYMMDD-HHMMSS.db` (UTC) and keeps the newest 7. Run it nightly from cron, and copy
the files off the server now and then. The copy includes everything: Tasks, the Change log, OAuth clients and tokens.

**Restore** (replaces the current data):

```sh
docker compose stop planner
docker compose run --rm --no-deps -u root -v /path/to/backup.db:/restore.db:ro --entrypoint sh planner -c \
  'rm -f /data/planner.db-wal /data/planner.db-shm && cp /restore.db /data/planner.db && chown node:node /data/planner.db'
docker compose start planner
```

The `-wal`/`-shm` files must be deleted, otherwise SQLite would replay the old log over the restored file.

## Use it

### Install on Android (PWA)

Open `PLANNER_URL` in Chrome, log in, menu (three dots) -> **Install app**. It opens full-screen from the home-screen
icon. The service worker caches only the app's own files; Tasks and login are never cached.

### Connect Claude

The connector address is `<PLANNER_URL>/mcp`. The Planner is its own OAuth server (dynamic client registration), so no
client id is needed.

- **claude.ai (web, do this first):** Settings -> Connectors -> Add custom connector. Name `Planner`, URL
  `<PLANNER_URL>/mcp`, leave the OAuth fields empty. Add, Connect, log in, approve. Then in a chat enable Planner and ask
  "List my tasks".
- **Claude on Android:** the connector added on the web is there under the same account.
- **Claude Code:** `claude mcp add --transport http planner <PLANNER_URL>/mcp`, then `/mcp` -> `planner` ->
  **Authenticate**.

If login fails, check that `<PLANNER_URL>/.well-known/oauth-protected-resource` and
`/.well-known/oauth-authorization-server` return JSON, and read `docker compose logs planner`.

### Review routines

Claude Code routines can draft your weekly and monthly Reviews through the connector: `routines/README.md`.

## Develop

Requirements: Node 24+ and pnpm.

```sh
pnpm install
pnpm dev            # http://localhost:5173, data in data/planner.db (WAL mode)
pnpm test           # Vitest
pnpm check          # svelte-check (TypeScript + Svelte types)
pnpm build          # production build in build/, run with: node build
```

Every page needs the owner login, so local development runs a throwaway Pocket ID next to the app:
`docs/auth-local-dev.md`. Connecting Claude Code to the local app: `docs/connect-claude-code.md`.

The database path comes from `PLANNER_DB` (default `data/planner.db`, relative to where the server starts).

## How the code is organised

- `src/lib/core/` - the **Planner core**. All rules and persistence.
  No Svelte, no system time. Built with an injected database, Clock and Home
  time zone; every command takes an Actor (`owner` / `claude`) and writes one
  change-log entry.
- `src/lib/server/planner.ts` - builds the real core (SQLite file, system clock).
- `src/routes/` - the UI. Thin: it turns form posts into core calls.
- `src/lib/server/auth/` - owner login (OIDC with Pocket ID, signed session cookie). `createAuth({config, fetch, clock})` is injectable; `hooks.server.ts` runs it on every request and sets `locals.actor`. Setup: `docs/auth-local-dev.md`.

## Conventions for extending the core

- **New command**: add a method to `Planner` in `core/index.ts`; inside `atomically(...)` mutate and call
  `record(actor, 'entity.verb', type, id, before, after)` exactly once; throw `Error` for rule violations
  (the transaction rolls back, so nothing is logged).
- **New table/column**: append a new SQL string to `MIGRATIONS` in `core/schema.ts`. Never edit old ones.
- **New test**: `const { planner, clock } = createTestPlanner({ homeTimeZone?, now? })` from
  `core/testing/harness.ts` (fresh in-memory DB, fake Clock: `clock.set(iso)` / `clock.advance(ms)`).
  Assert only through public `Planner` methods, including `changeLog()`.
- The core is split by entity area: `core/tasks.ts`, `core/changelog.ts`, ... Each exports an `XxxApi`
  interface and an `xxxModule(ctx)` factory (`ctx` has `db`, `nowIso`, `atomically`, `record`).
  New area = new file + one line in `Planner` and one in `createPlanner` (`core/index.ts`).

## How to make a new entity trashable and undoable (Trash, restore, purge, undo)

The safety net lives in `core/safety.ts` and knows nothing about specific entities. An entity area
plugs in by registering an **EntityKind** in its module factory (see `core/tasks.ts` for a 15-line example):

```ts
entities.register<Goal>({
	type: 'goal',                       // the same string you pass to record(...)
	read: (id) => /* full snapshot, or null if absent */,
	write: (snapshot) => /* INSERT OR REPLACE the row (and rows it owns) so read(id) == snapshot */,
	remove: (id) => /* hard-delete the row (and rows it owns) */,
	label: (g) => g.title               // optional, shown in Trash
});
```

Rules that make it work:

- **A snapshot is the complete state** (every column, plus owned children such as subtasks/milestones nested
  inside it), and always has `id`. Your commands must pass exactly these snapshots as `before`/`after` to `record(...)`
  (use your `read`). Undo compares the entity's current snapshot with the entry's `after` to detect later changes,
  then `write`s the `before`. When you add a field, add it to the snapshot AND to `write`.
- `write` may `throw` to refuse (e.g. restoring a task whose project is gone). Keep `write`/`remove` free of logging.
- Do NOT write your own delete/restore/undo commands and never add a `deleted_at` column: read queries just
  see the row gone while it is in Trash. Delete = `planner.deleteItem(actor, 'goal', id)`, restore =
  `planner.restoreItem`, undo = `planner.undoChange(actor, changeId)`; all log automatically (`goal.delete`,
  `goal.restore`, `goal.update.undo`, ...).
- Use plain integer ids (AUTOINCREMENT, never reused) and no `ON DELETE CASCADE` surprises: children you want
  back after restore must be inside the parent's snapshot.
- Already generic, nothing to add: MCP tools `delete_item`, `restore_item`, `list_trash`, `list_changes`,
  `undo_change` (`type` argument = your `type`), the Trash page and Change log page. Only add a Russian name
  for the type in `src/lib/labels.ts` (`ENTITY_NAMES`) and, if you want a delete button, a form action that
  calls `deleteItem` (see `routes/+page.server.ts`).
- Tests: `createTestPlanner()`, then create / `deleteItem` / `restoreItem` / `undoChange` your entity and compare
  with `planner.listXxx()` (see `core/trash.test.ts`, `core/undo.test.ts`).

Registered so far: `event` (full snapshot incl. recurrence), `task` (snapshot includes projectId, tags, subtasks; `write` restores the tag and subtask rows and
refuses if its project is gone/in Trash) and `project`. **Trashing a Project that still has Tasks is refused**
(`Project N still has K task(s); move or delete them first`), so no Task ever points at a missing Project;
this also makes undo of `project.create` refuse while tasks use it.

Optional `comparable(snapshot)` on an EntityKind narrows what undo compares (Habit: without its Check-ins, which are separate entities, so a later Check-in does not block undoing a Habit edit and `write` leaves existing Check-ins alone; Task tags/subtasks stay in the Task snapshot on purpose, they are edited through Task commands and logged on the Task).

Behaviour: undo of create = soft delete; undo of delete = restore; undo of update/complete = write the `before`
snapshot back. Undo is refused (`Cannot undo change #N: <reason>`) if the entity no longer equals that entry's
`after`, was already restored, or was purged. An undo is itself a logged change and can be undone.

**Purge**: items stay in Trash for `trashRetentionDays` (construction-time dependency, default 30). `planner.purgeTrash()`
deletes those older than that by the injected Clock (tests use the fake Clock). In the running app
`server/planner.ts` calls it when the planner is first built (server start) and then every hour; no cron needed.
Purge is housekeeping and is not written to the Change log.

- **Events** (`core/events.ts`): timed Events are UTC instants + their own IANA zone; all-day Events are local dates
  (end inclusive). `agenda(from, to)` (core/agenda.ts) merges per-source item lists: Events (`kind: 'event'`) and open Tasks (`kind: 'task'`, `placement: 'time_block'` or `'due'`; a Task both due and time-blocked appears once, as its block). A Task's optional `timeBlock` (UTC start + minutes) is set via `createTask`/`updateTask`.
  Events are trashable/undoable through the generic Trash (`entities.register`, type `event`). UI: `/events` (agenda), `/events/day/<date>`, `/events/week/<date>` (Monday-first week), `/events/new`, `/events/<id>`.
- **Recurring Events** (`core/recurrence.ts`, `core/events.ts`): a recurring Event is ONE row (first occurrence + RFC 5545
  `RRULE` in `recurrence`, wall clock + IANA zone, so 09:00 stays 09:00 across DST); `agenda()` expands occurrences for the
  range, nothing is stored per occurrence. An occurrence is addressed by `recurrenceId` (its original start,
  `2026-03-30T09:00`, or a date for all-day). Cancels and single edits are `overrides` in the same row (so the whole series is
  one Trash/undo snapshot): `cancelOccurrence`, `updateOccurrence`; "this and following" is `updateFollowing` (cuts the old
  series with UNTIL, starts a new Event; ONE change-log entry `event.split` on the old series whose snapshots carry the new series as `splitTail`, so
  one undo removes the new series (refused if it was changed since), redo re-creates it). `updateEvent` on a recurring Event edits the whole series. Pinned behaviour: a wall-clock time that falls in
  a spring-forward gap is shifted after the gap (RFC 5545: offset before the gap; counts toward COUNT; its `recurrenceId` stays the original wall clock, the feed exports the same RRULE/EXDATE so clients agree); `BYMONTHDAY=31` skips short months. The recurrence module has no Event knowledge: other
  entities (repeating Tasks) use `RuleSpec` + `occurrencesBetween`/`occurrenceAt`/`normalizeRule`/`toRfcRule`.
  Search (story 67): `searchTasks(text, {projectId, tag, dueFrom, dueTo})` and `searchEvents({text, from, to})`; MCP `search_tasks`, `search_events`.
  MCP: `create_event`/`update_event` take `recurrence`; `update_event` takes `recurrenceId` + `scope` (`this`/`following`/`all`);
  `cancel_occurrence`. UI: recurrence editor in the Event form (`events/RecurrenceFields.svelte`, logic in `recurrence-form.ts`).

- **Repeating Tasks** (`core/tasks.ts`): `Task.repeat` is `{type:'fixed', rrule}` (RRULE counted from the due date, via the
  recurrence module; needs a due date) or `{type:'after', every, unit}` (from the completion day, Home zone). Completing a
  repeating Task keeps it as history and creates the next instance: fixed = first occurrence after both the due date and
  today (so late completion skips missed ones, early completion does not repeat the same one); `COUNT` shrinks and the series
  ends when the rule runs out. The next instance copies title, priority, project, tags, milestone link, shifts the Time block
  by the same number of days and resets subtasks to unchecked. **Link and undo**: the completed Task stores `nextId`; the
  next instance is part of the one `task.complete` entry (its after-snapshot carries `nextId`). The Task registry's `write` keeps the
  pair consistent, so the generic undo (which writes the before snapshot) and `uncompleteTask` remove the next instance, and
  undoing the undo re-creates it with the same id. They refuse (`the next instance ... was already changed or completed`) once
  the next instance was edited or completed; if it is in Trash its Trash entry is dropped. MCP: `create_task`/`update_task`
  take `repeat`. UI: repeat form in the task details (`routes/repeat-form.ts`); complex RRULEs set by Claude are kept as-is.

- **Goals and Milestones** (`core/goals.ts`): a Goal has status active / paused / achieved / dropped and ordered Milestones
  (done flag, optional target date). `Task.milestoneId` and `Habit.goalId` are the links (set with `setTaskMilestone` /
  `linkHabitToGoal`, `null` unlinks). Registered with the generic Trash as `goal` (snapshot includes its Milestones) and
  `milestone`. **Link policy**: status changes, archiving a Habit, completing a Task never touch links. Trash never touches
  them either: the id stays on the Task/Habit row but is *dormant* (not counted in `goalProgress`) while the Goal/Milestone is
  in Trash and live again on restore; new links to a trashed/missing target are refused. Ids are never reused, so a dormant
  link cannot point at something else. **Reusable query** `planner.goalProgress({ goalId?, includeInactive? })` returns
  `GoalProgress[]`: `{ goal, milestones: {done,total,percent}, milestoneList, tasks: {done,total,items:[{task,milestoneId}]}, habits: HabitStatus[] }`
  (MCP: `get_goal_progress`; Reviews and Stats should call it rather than recompute). UI: `/goals`, `/goals/<id>`.

- **Calendar feed** (`core/feed.ts`, `server/feed.ts`, route `routes/feed/[file]/+server.ts`, UI `/calendar`): read-only
  iCalendar of all Events and open Tasks that have a Time block. `planner.calendarFeed()` returns the text. Mapping: Event ->
  VEVENT `event-<id>@planner` with `DTSTART;TZID=<its zone>` (all-day: `VALUE=DATE`, DTEND = day after the inclusive end),
  `RRULE` from `toRfcRule`, one `EXDATE` per cancelled occurrence, a second VEVENT with `RECURRENCE-ID` per edited/moved
  occurrence; Task -> `task-<id>@planner`, summary `[Задача] <title>`, in the Home zone. VTIMEZONE blocks come from
  `timezones-ical-library` (knows `Europe/Kyiv`). Done Tasks are not exported. The secret (`feedSecret()`, table `feed_secret`,
  random from the first migration) is compared in constant time (`isFeedSecret`); `regenerateFeedSecret(actor)` replaces it and
  logs `feed.regenerate` WITHOUT the secret (so that entry cannot be undone, by design: a revoked URL must stay revoked).
  `/feed/*` is the only path hooks.server.ts lets through without login; anything but the exact current secret is a plain 404.
  The feed's few fixed texts (calendar name `Планировщик`, Task summary prefix `[Задача]`) are Russian IN the core on purpose: they are
  the owner's own calendar content, not UI chrome; everything else in core stays language-neutral.
  Tests parse the output back with `ical.js` (`core/testing/ics.ts`). Not exported yet: Tasks' repeat rules, Habits.
  **Subscribing (manual check, needs the public deployment):** open `/calendar` in the Planner, press "Скопировать ссылку".
  Google Calendar (web; the Android app then shows it): calendar.google.com -> "Other calendars" `+` -> "From URL" -> paste ->
  "Add calendar" (Google refreshes every 8-24 hours, so changes are not instant; on Android tick the calendar in the app's
  Settings -> your account). Outlook on Windows (new Outlook / outlook.com): Calendar -> "Add calendar" -> "Subscribe from web"
  -> paste the URL, name it. Classic Outlook: File -> Account Settings -> Account Settings -> "Internet Calendars" -> New ->
  paste. Check: a recurring Event shows on every occurrence, a cancelled one is missing, a moved one is at its new time, times
  match the Event's own zone. "Создать новую ссылку" on `/calendar` revokes the old URL (a subscription to it then stays
  empty or shows an error until re-added with the new link).

- **Reviews** (`core/reviews.ts`): a Review is one per (week|month, period start) with a Markdown `draft` (usually Claude) and the
  owner's `reflection`. Registered with the generic Trash as `review`; restoring is refused if the period got a new Review meanwhile.
  **Reusable query** `planner.reviewData({ period: 'week'|'month', date? })` (MCP `get_review_data`): week = ISO Monday..Sunday,
  month = calendar month, both in the Home zone, `date` = any day inside it (default today). Returns `tasks.done` (completed in
  the period), `tasks.slipped`, `habits[]`, `goals` (= `goalProgress`, CURRENT - not as of the period end; Milestone completion, links and Goal status are not time-stamped, so past progress cannot be reconstructed) and `review` (already saved one or null).
  **Slipped** = Task still open, with a due date inside the period, and that due date before today. (Completed later = no longer
  slipped; undated or earlier-due Tasks never count.) **Habit hit-rate** = percent of the Habit's own Periods (ISO weeks or months)
  that *ended inside the review period and before today* and were met; `null` when none could be judged (e.g. open week).
  A weekly Habit in a month review is judged over the ISO weeks that END in that month. Habits that existed during the period count (created by its end, not trashed), including ones archived AFTER it; Periods that ended before a Habit was created are never judged (Reviews and Stats share `habitExistedBy`). `streak` is as of the period end.
  UI: `/reviews` (list, start this week/month), `/reviews/<id>` (edit draft + reflection, period numbers shown). MCP: `get_review_data`,
  `create_review`, `update_review`, `get_review`, `list_reviews`.

## Conventions for MCP tools (the Claude connector)

Code: `src/lib/server/connector/` (OAuth server `oauth.ts`, `/mcp` endpoint `mcp.ts`, tools in `tools/`).
Connect Claude Code locally: `docs/connect-claude-code.md`.

- **New tool**: add it to the module for its entity area in `connector/tools/<area>.ts` (create the file for a new area
  and add ONE line to `toolModules` in `tools/index.ts`). A module is `export const registerXxxTools: RegisterTools = (server, { planner, actor }) => { ... }`.
- Register with `server.registerTool(name, { description, inputSchema: z.object({...}) }, reply((args) => planner.someCommand(actor, ...)))`.
  Names are `snake_case`, names and descriptions in English; user content passes through unchanged. Always pass
  the injected `actor` (always `claude` here) to core commands; tools hold no domain logic.
- `reply(...)` JSON-encodes the return value as the tool result and turns a thrown `Error` (core rule violation)
  into an `isError` result Claude can read.
- **Contract test** (seam 2) for a tool: use `createTestConnector()` from `connector/testing/harness.ts`:
  `const t = createTestConnector(); const claude = await t.connectClaude();` (runs the whole OAuth dance, returns the
  official MCP `Client`), then `claude.callTool(...)`, `toolJson(result)` to parse the answer, and assert on
  `t.planner` (e.g. `t.planner.changeLog()` has actor `claude`). Put them in `connector/tools/<area>.test.ts`.
  `t.fetch` / `t.registerClient` / `t.authorizeClient` / `t.connect(token)` are there for auth-level tests.
- Live check without a browser: `node --env-file=.env scripts/connector-e2e.mjs` while `pnpm dev` runs.
- Import project files with `#lib/...js` (see the note below), always with the `.js` suffix.

## Svelte, in plain language

- **A `.svelte` file is a component**: a `<script>` block (logic), markup
  (HTML), and a `<style>` block whose CSS applies only to that component.
- **`+page.svelte`** is the page shown at a URL. **`+page.server.ts`** runs only
  on the server next to it: `load` fetches the data the page needs, and
  `actions` handle `<form method="POST">` submissions.
- **`let { data, form } = $props()`** is how the page receives what `load` returned
  (`data`) and what the last action returned (`form`, e.g. an error message).
  `$props` is a "rune": a special `$`-prefixed function that the Svelte compiler understands.
- **`use:enhance`** on a form makes it submit in the background (no full page reload)
  and then refresh `data`. Without JavaScript the same form still works as a plain post.
- **`{#each}` / `{#if}`** repeat or conditionally show markup. `class:done={...}`
  adds the CSS class `done` when the expression is true.
- **Note:** this project uses SvelteKit 3, which differs from older tutorials:
  config is passed to `sveltekit(...)` in `vite.config.ts` (no `svelte.config.js`)
  and `$lib` is now `#lib` (set up in `package.json` under `imports`).
