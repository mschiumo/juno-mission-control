# Collaborative Goals — Claude agent handoff

Hand a **Collaborative** goal off to a Claude agent, then watch it work. The agent
pulls the task from a queue, does the work wherever it runs (your machine, the
Claude API, a scheduled job), and posts progress back — which shows up live in the
Goals tab (status badge + a progress log on the goal).

```
  Goals tab (owner)                 Agent API                     A Claude agent
  ─────────────────                 ─────────                     ──────────────
  "Hand off to Claude"  ──────►  assignee = 'agent'   ◄──GET──   poll the queue
  watch status + log    ◄──────  goals_data (Redis)   ◄─POST──   report progress
```

Nothing here is autonomous on its own — **you** point a Claude agent at the API.
The app just provides the queue + the progress channel.

---

## 1. One-time setup: `AGENT_SECRET`

The agent API is owner-scoped and authenticated by a bearer token (it never uses a
browser session, so headless agents work). Set a strong secret:

- **Local:** add `AGENT_SECRET=...` to `.env.local`, restart `npm run dev`.
- **Production:** add `AGENT_SECRET` in Vercel → Project → Settings → Environment
  Variables, then redeploy.

Without it the endpoint returns `503`. With a wrong/absent token it returns `401`.

## 2. Hand off a task (UI)

Goals → **Collaborative** tab → open a goal → **Claude agent** → **Hand off to
Claude**. (Tip: add **Milestones** first so the agent has a concrete checklist.)
The card then shows a `Queued` badge; it flips to `Working` / `Blocked` / `Done` as
the agent reports.

## 3. The agent API

Base URL: `http://localhost:3500` (local) or your production domain.

### Pull the queue
```bash
curl -s "$BASE/api/goals/agent?status=queued" \
  -H "Authorization: Bearer $AGENT_SECRET"
# → { success, count, tasks: [{ id, title, notes, agentStatus, actionItems, ... }] }
```

### Report progress
```bash
curl -s -X POST "$BASE/api/goals/agent" \
  -H "Authorization: Bearer $AGENT_SECRET" \
  -H "Content-Type: application/json" \
  -d '{ "goalId": "<id>", "status": "working", "log": "Drafting the outline" }'
```
`POST` body fields (all optional except `goalId`):

| field | effect |
|-------|--------|
| `status` | `queued` \| `working` \| `blocked` \| `done`. `working` auto-moves the goal to In Progress; `done` marks it Done. |
| `log` | a progress line appended to the timeline (capped at 50). |
| `addActionItems` | `string[]` — new milestones. |
| `completeActionItem` | a milestone id to mark complete. |
| `phase` | explicit `not-started` \| `in-progress` \| `achieved`. |
| `requestHelp` | a question for the owner — **blocks** the goal and surfaces it under "Needs your input" in the Collaborative activity feed. Read `task.helpRequest.answer` on a later GET to resume. |
| `addResource` | `{ title, url?, content?, filename? }` — attach a deliverable reachable from the UI: an external link and/or inline file text the owner can **view + download** under "Resources". Use it for anything you produce; a local file path alone isn't reachable from the web app, so send the file's `content`. |
| `by` | label for who posted (defaults to `claude`). |

### Ask for help when stuck
If the agent hits a blocker only the owner can resolve, it POSTs `requestHelp:"<question>"`.
The goal is marked **Blocked**, the question appears under **Needs your input** in the
Collaborative activity feed, and the owner's reply lands on `task.helpRequest.answer` —
which the agent reads on its next GET to resume. Every action (owner's and agent's) is
logged to that feed with a timestamp, so you can follow the back-and-forth.

### Share deliverables
When the agent produces something the owner should access — a written guide, a draft, a
report — it attaches it with `addResource` (the file's `content` and/or a `url`), **not**
just a local path. The resource appears under **Resources** in the feed, where the owner
can view, copy, or download it.

## 4. Three ways to run an agent

**a) Claude Code (recommended, on-demand).** In a Claude Code session, give it the
secret + base URL and ask it to work the queue — it uses `curl` to pull tasks, does
the work, and posts progress. A ready prompt:

> You are my Goals agent. `GET $BASE/api/goals/agent?status=queued` with header
> `Authorization: Bearer $AGENT_SECRET`. For each task: POST `status:"working"` with
> a starting `log`, do the work, post a `log` per milestone (and
> `completeActionItem`), then POST `status:"done"` with a summary `log`. If you're
> blocked on something only I can answer, POST `requestHelp:"<question>"` and read
> `helpRequest.answer` on a later GET to resume. Keep each `log` and `requestHelp`
> short (one line / a sentence or two) — they render verbatim in the activity feed,
> so put longer detail in milestones or notes. When you produce a deliverable (a doc,
> guide, draft), attach it with `addResource` (its `content` and/or a `url`) so I can
> open it in the UI — don't just give a local file path. Stop when the queue is empty.

**b) Node worker + Claude API.** Use [`scripts/goal-agent-worker.mjs`](../scripts/goal-agent-worker.mjs)
as the polling bridge; drop your Claude API call into its `handleTask()`.

**c) Scheduled routine / cron.** Run the worker (or a Claude scheduled agent) on a
timer so handed-off tasks get picked up automatically.

## 5. Security
- Owner-scoped: the API only ever reads/writes the owner's Collaborative goals.
- Treat `AGENT_SECRET` like a password; rotate by changing the env var.
- The endpoint can only touch goals already handed off (`assignee === 'agent'`),
  so an agent can't reach into the rest of your goals.
