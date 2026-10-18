# Weekly and monthly review routines (ticket #21)

Claude Code routines on the owner's Pro plan write a draft Review through the Planner connector. The prompts are kept here for reference and to paste into the routines:

- `routines/weekly-review.md`: the weekly routine
- `routines/monthly-review.md`: the monthly routine

The routines only call `get_review_data`, then `create_review` (no Review yet) or `update_review` (draft only, never the reflection). Re-running is safe: it replaces the draft and leaves your reflection alone. Drafts are in Russian.

## Schedule choices

Routine schedules are cron expressions in **UTC** with a minimum interval of one hour. Home time is Europe/Istanbul (UTC+3 all year, no DST), so the conversion is a constant 3 hours.

| Routine | Wanted (Istanbul) | Cron (UTC) |
|---|---|---|
| Weekly | Sunday 20:00 | `0 17 * * 0` |
| Monthly | the 1st, 06:00, for the month just ended | `0 3 1 * *` |

Why the monthly one runs on the 1st: cron cannot say "last day of the month". The alternative, a daily run on days 28 to 31 with a last-day check, costs about 4 runs a month, mostly wasted. Running once on the 1st costs 1 run a month; the prompt computes yesterday's date in Home time (always inside the previous month) and passes it as `date` to `get_review_data`. The only downside is that the draft appears early on the 1st instead of the evening before.

Budget: about 4 to 5 weekly runs and 1 monthly run per month, far under the Pro plan's 5 runs a day (routines are a research preview, limits may change).

If the schedule form shows times in your local zone instead of UTC, enter the Istanbul time directly (Sunday 20:00; the 1st at 06:00). Either way, check the shown "next run" against the table.

## Create the routines (owner, once)

Prerequisites: the production Planner is deployed (`docs/server-setup.md`, tickets #17 and #19) and the connector `Planner` is added in claude.ai (section 5.1 there).

Field and button names may differ; follow the current routines UI.

1. Open https://claude.ai/code/routines and create a new routine.
2. Name it `Planner: weekly review`.
3. Prompt: paste the part below the line of `routines/weekly-review.md`.
4. Connectors: attach the `Planner` connector. A routine runs in the cloud, so check that the Planner shows as connected there; if it asks to authenticate, do so (passkey login via Pocket ID).
5. Repository and environment: a routine needs an environment (the default is fine). The task does not use a repository; if the form requires one, pick this repo, the prompt never touches it.
6. Schedule: cron `0 17 * * 0` (UTC).
7. Save, then repeat for `Planner: monthly review` with `routines/monthly-review.md` and cron `0 3 1 * *`.

## Manual "Run now" end-to-end check (acceptance)

1. In the weekly routine use the run-now action of the routines UI.
2. Open the finished run and check there were no errors: it called `get_review_data`, then `create_review`.
3. Open the Planner, Reviews: the current week has a draft in Russian with sections Сделано, Не сделано, Привычки, Цели, and an empty reflection.
4. Write something into the reflection and save. Run the routine again. Expected: the same Review is updated (same id, new draft text), your reflection is unchanged.
5. Repeat steps 1 to 3 for the monthly routine. It reviews the previous month, so its draft appears under last month. Its date logic is written for the 1st but works on any day.
6. Tick the boxes in ticket #21.

## If something goes wrong

- The run log (open the run) shows the tool calls and errors. A connector authentication error means re-authenticating the Planner connector for the routine.
- A bad draft: fix the prompt here and in the routine, run again; the draft is replaced.
- Routines gone, over budget or changed (research preview): use the fallback below. The MCP tools are the same.

## Fallback: do the review in conversation

In claude.ai, the Android app or Claude Code with the Planner connector enabled, say "let's do the weekly review" (or monthly). Claude calls `get_review_data`, walks you through the numbers, asks for your reflection, then saves it with `create_review` or `update_review` (draft and your reflection). Ask it to write in Russian if it answers in English.
