/**
 * Goal agent worker — a thin bridge to the Collaborative-goals agent API.
 *
 * It pulls tasks the owner handed off (assignee === 'agent') and reports progress
 * back. The actual "doing the work" is up to you: wire your Claude API call (or
 * any logic) into handleTask(). This file deliberately does NOT perform work on
 * its own — it just demonstrates the GET-queue / POST-progress loop.
 *
 * Usage:
 *   BASE_URL=http://localhost:3500 AGENT_SECRET=... node scripts/goal-agent-worker.mjs        # list the queue
 *   BASE_URL=... AGENT_SECRET=... node scripts/goal-agent-worker.mjs --run                     # process the queue once
 *   BASE_URL=... AGENT_SECRET=... node scripts/goal-agent-worker.mjs --run --watch             # keep polling
 *
 * See docs/goal-agents.md for the full picture.
 */

const BASE_URL = process.env.BASE_URL || 'http://localhost:3500';
const AGENT_SECRET = process.env.AGENT_SECRET;
const WATCH = process.argv.includes('--watch');
const RUN = process.argv.includes('--run');
const POLL_MS = Number(process.env.POLL_MS) || 20000;

if (!AGENT_SECRET) {
  console.error('Set AGENT_SECRET (and optionally BASE_URL). See docs/goal-agents.md');
  process.exit(1);
}

const headers = { Authorization: `Bearer ${AGENT_SECRET}`, 'Content-Type': 'application/json' };

async function getQueue() {
  const res = await fetch(`${BASE_URL}/api/goals/agent?status=queued`, { headers });
  if (!res.ok) throw new Error(`queue fetch failed: ${res.status} ${await res.text()}`);
  return (await res.json()).tasks;
}

async function report(goalId, payload) {
  const res = await fetch(`${BASE_URL}/api/goals/agent`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ goalId, ...payload }),
  });
  if (!res.ok) throw new Error(`report failed: ${res.status} ${await res.text()}`);
  return res.json();
}

/**
 * Do the actual work for one task. Replace the body with your Claude API call.
 * Use report(task.id, { ... }) to stream progress as you go.
 */
async function handleTask(task) {
  console.log(`\n▶ ${task.title}`);
  await report(task.id, { status: 'working', log: 'Picked up by worker' });

  // ── Your agent logic goes here. For example, with the Claude API:
  //   const out = await callClaude(task.title, task.notes, task.actionItems);
  //   for (const step of out.steps) await report(task.id, { log: step });
  //
  // Placeholder so a dry run is safe — marks blocked and asks for wiring:
  await report(task.id, {
    status: 'blocked',
    log: 'No agent logic wired yet — implement handleTask() in scripts/goal-agent-worker.mjs',
  });
}

async function tick() {
  const tasks = await getQueue();
  console.log(`${new Date().toISOString()} — ${tasks.length} queued task(s)`);
  for (const t of tasks) console.log(`  • ${t.title} (${t.id})`);
  if (RUN) for (const t of tasks) await handleTask(t);
}

async function main() {
  await tick();
  if (WATCH) {
    setInterval(() => tick().catch((e) => console.error(e.message)), POLL_MS);
  }
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
