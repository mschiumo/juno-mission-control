#!/usr/bin/env node
/**
 * SnapTrade trade-data recovery / diagnostics
 *
 * Companion to the fix in lib/snaptrade-sync.ts. Older sync code did a full-list
 * REPLACE and would blank a user's trades when the broker feed came back empty
 * (stale connection with no linked accounts, or SnapTrade still backfilling).
 * The pre-sync list was snapshotted once to `trades:v2:backup:<userId>`; this
 * script inspects and restores from it, and can purge the stale connection
 * record so the cron stops re-wiping.
 *
 * Runs against whatever Redis UPSTASH_REDIS_URL / REDIS_URL points at, so POINT
 * IT AT PRODUCTION to recover production data:
 *
 *   # 1. See what's there (read-only, safe):
 *   UPSTASH_REDIS_URL="rediss://…prod…" node scripts/snaptrade-recover.mjs inspect
 *
 *   # 2. Restore a user's trades from their backup (re-snapshots current first):
 *   UPSTASH_REDIS_URL="rediss://…prod…" node scripts/snaptrade-recover.mjs restore <userId> --yes
 *
 *   # 3. Remove a stale/empty broker connection so the cron stops touching them:
 *   UPSTASH_REDIS_URL="rediss://…prod…" node scripts/snaptrade-recover.mjs purge-connection <userId> --yes
 *
 * Every mutating command requires --yes; without it the command is a dry run.
 */

import { createClient } from 'redis';

const DATA = (u) => `trades:v2:data:${u}`;
const BACKUP = (u) => `trades:v2:backup:${u}`;
const CONN = (u) => `broker:snaptrade:${u}`;

const [, , cmd, ...rest] = process.argv;
const args = rest.filter((a) => !a.startsWith('--'));
const flags = new Set(rest.filter((a) => a.startsWith('--')));
const confirmed = flags.has('--yes');

function tradeCount(raw) {
  if (!raw) return 0;
  try {
    return (JSON.parse(raw).trades ?? []).length;
  } catch {
    return -1; // malformed
  }
}

async function main() {
  const url =
    process.env.UPSTASH_REDIS_URL || process.env.REDIS_URL || 'redis://localhost:6379';
  const isLocal = url.includes('localhost') || url.includes('127.0.0.1');
  console.log(`Redis: ${isLocal ? url : url.replace(/:\/\/.*@/, '://***@')}\n`);

  const redis = createClient({ url, socket: { reconnectStrategy: false } });
  redis.on('error', (e) => console.error('Redis error:', e.message));
  await redis.connect();

  try {
    if (!cmd || cmd === 'inspect') {
      const userIds = new Set();
      for await (const key of redis.scanIterator({ MATCH: 'trades:v2:data:*', COUNT: 100 }))
        userIds.add((Array.isArray(key) ? key[0] : key).replace('trades:v2:data:', ''));
      for await (const key of redis.scanIterator({ MATCH: 'trades:v2:backup:*', COUNT: 100 }))
        userIds.add((Array.isArray(key) ? key[0] : key).replace('trades:v2:backup:', ''));
      for await (const key of redis.scanIterator({ MATCH: 'broker:snaptrade:*', COUNT: 100 }))
        userIds.add((Array.isArray(key) ? key[0] : key).replace('broker:snaptrade:', ''));

      if (userIds.size === 0) {
        console.log('No trade/backup/connection keys found.');
        return;
      }

      for (const u of userIds) {
        const [data, backup, conn] = await Promise.all([
          redis.get(DATA(u)),
          redis.get(BACKUP(u)),
          redis.get(CONN(u)),
        ]);
        const backupParsed = backup ? JSON.parse(backup) : null;
        const connParsed = conn ? JSON.parse(conn) : null;
        console.log(`user ${u}`);
        console.log(`  live trades   : ${tradeCount(data)}`);
        console.log(
          `  backup trades : ${tradeCount(backup)}` +
            (backupParsed?.savedAt ? `  (savedAt ${backupParsed.savedAt})` : '  (none)')
        );
        if (connParsed) {
          console.log(
            `  broker conn   : accounts=${(connParsed.accounts ?? []).length}` +
              ` lastSyncedAt=${connParsed.lastSyncedAt ?? 'never'}`
          );
          if ((connParsed.accounts ?? []).length === 0)
            console.log('    ⚠️  STALE: 0 linked accounts — the cron would wipe this user pre-fix.');
        } else {
          console.log('  broker conn   : none');
        }
        console.log('');
      }
      console.log('Read-only. To recover: node scripts/snaptrade-recover.mjs restore <userId> --yes');
      return;
    }

    if (cmd === 'restore') {
      const u = args[0];
      if (!u) throw new Error('usage: restore <userId> [--yes]');
      const [data, backup] = await Promise.all([redis.get(DATA(u)), redis.get(BACKUP(u))]);
      if (!backup) throw new Error(`No backup key ${BACKUP(u)} — nothing to restore.`);
      const liveN = tradeCount(data);
      const backupN = tradeCount(backup);
      console.log(`Restore ${u}: live ${liveN} → backup ${backupN} trades.`);
      if (!confirmed) {
        console.log('Dry run. Re-run with --yes to apply.');
        return;
      }
      // Snapshot current live data to a timestamped safety key before overwriting.
      if (data) {
        const safety = `trades:v2:prerestore:${u}:${Date.now()}`;
        await redis.set(safety, data);
        console.log(`Saved current live data to ${safety}`);
      }
      const parsed = JSON.parse(backup);
      await redis.set(DATA(u), JSON.stringify({ trades: parsed.trades ?? [] }));
      console.log(`✅ Restored ${backupN} trades to ${DATA(u)}.`);
      console.log('Next: purge the stale connection so the cron stops re-wiping:');
      console.log(`  node scripts/snaptrade-recover.mjs purge-connection ${u} --yes`);
      return;
    }

    if (cmd === 'purge-connection') {
      const u = args[0];
      if (!u) throw new Error('usage: purge-connection <userId> [--yes]');
      const conn = await redis.get(CONN(u));
      if (!conn) {
        console.log(`No connection key ${CONN(u)}.`);
        return;
      }
      const accounts = (JSON.parse(conn).accounts ?? []).length;
      console.log(`Connection ${u}: ${accounts} linked account(s).`);
      if (!confirmed) {
        console.log('Dry run. Re-run with --yes to delete the connection record.');
        return;
      }
      await redis.del(CONN(u));
      console.log(`✅ Deleted ${CONN(u)}. The cron will no longer sync this user.`);
      return;
    }

    throw new Error(`Unknown command "${cmd}". Use: inspect | restore | purge-connection`);
  } finally {
    await redis.disconnect();
  }
}

main().catch((e) => {
  console.error('\n❌', e.message);
  process.exit(1);
});
