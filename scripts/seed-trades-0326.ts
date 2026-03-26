/**
 * Seed script: Add 03/26 trades from TOS account statement
 *
 * Calculates correct round-trip P&L including short covers (WYFI, PONY)
 * that the TOS parser can't pair from the Account Trade History alone.
 *
 * Usage: npx tsx scripts/seed-trades-0326.ts
 */

import { createClient } from 'redis';
import { randomUUID } from 'crypto';
import bcrypt from 'bcryptjs';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

interface Trade {
  id: string;
  userId: string;
  symbol: string;
  side: 'LONG' | 'SHORT';
  status: 'OPEN' | 'CLOSED' | 'PARTIAL';
  strategy: string;
  entryDate: string;
  entryPrice: number;
  shares: number;
  entryNotes?: string;
  exitDate?: string;
  exitPrice?: number;
  exitNotes?: string;
  grossPnL?: number;
  netPnL?: number;
  returnPercent?: number;
  createdAt: string;
  updatedAt: string;
}

async function main() {
  const client = createClient({ url: REDIS_URL });
  await client.connect();
  console.log('Connected to Redis');

  // Find or create user
  let userId = await client.get('user:email:test@juno.dev');
  if (!userId) {
    userId = randomUUID();
    const passwordHash = await bcrypt.hash('test1234', 12);
    const user = {
      id: userId,
      email: 'test@juno.dev',
      name: 'Test User',
      passwordHash,
      createdAt: new Date().toISOString(),
    };
    await client.set(`user:${userId}`, JSON.stringify(user));
    await client.set('user:email:test@juno.dev', userId);
    console.log(`Created user: test@juno.dev / test1234 (id: ${userId})`);
  } else {
    console.log(`Found existing user: ${userId}`);
  }

  const now = new Date().toISOString();

  // 03/26 trades — all 7 round trips
  const trades: Trade[] = [
    // 1. BATL — LONG +$34.65
    {
      id: randomUUID(),
      userId,
      symbol: 'BATL',
      side: 'LONG',
      status: 'CLOSED',
      strategy: 'DAY_TRADE',
      entryDate: '2026-03-26T09:33:56-05:00',
      entryPrice: 6.28,
      shares: 105,
      exitDate: '2026-03-26T09:42:49-05:00',
      exitPrice: 6.61,
      grossPnL: (6.61 - 6.28) * 105, // 34.65
      netPnL: 34.65,
      returnPercent: ((6.61 - 6.28) / 6.28) * 100,
      entryNotes: 'Imported from TOS Account Statement',
      createdAt: now,
      updatedAt: now,
    },
    // 2. AIFF — LONG -$34.10
    {
      id: randomUUID(),
      userId,
      symbol: 'AIFF',
      side: 'LONG',
      status: 'CLOSED',
      strategy: 'DAY_TRADE',
      entryDate: '2026-03-26T10:09:08-05:00',
      entryPrice: 2.40,
      shares: 110,
      exitDate: '2026-03-26T10:11:39-05:00',
      exitPrice: 2.09,
      grossPnL: (2.09 - 2.40) * 110, // -34.10
      netPnL: -34.10,
      returnPercent: ((2.09 - 2.40) / 2.40) * 100,
      entryNotes: 'Imported from TOS Account Statement',
      createdAt: now,
      updatedAt: now,
    },
    // 3. KOD — LONG +$4.34
    {
      id: randomUUID(),
      userId,
      symbol: 'KOD',
      side: 'LONG',
      status: 'CLOSED',
      strategy: 'DAY_TRADE',
      entryDate: '2026-03-26T10:31:22-05:00',
      entryPrice: 35.22,
      shares: 14,
      exitDate: '2026-03-26T12:15:53-05:00',
      exitPrice: 35.53,
      grossPnL: (35.53 - 35.22) * 14, // 4.34
      netPnL: 4.34,
      returnPercent: ((35.53 - 35.22) / 35.22) * 100,
      entryNotes: 'Imported from TOS Account Statement',
      createdAt: now,
      updatedAt: now,
    },
    // 4. NAVN (1st) — LONG +$39.00
    {
      id: randomUUID(),
      userId,
      symbol: 'NAVN',
      side: 'LONG',
      status: 'CLOSED',
      strategy: 'DAY_TRADE',
      entryDate: '2026-03-26T11:44:32-05:00',
      entryPrice: 11.35,
      shares: 75,
      exitDate: '2026-03-26T12:39:08-05:00',
      exitPrice: 11.87,
      grossPnL: (11.87 - 11.35) * 75, // 39.00
      netPnL: 39.00,
      returnPercent: ((11.87 - 11.35) / 11.35) * 100,
      entryNotes: 'Imported from TOS Account Statement (1st round trip)',
      createdAt: now,
      updatedAt: now,
    },
    // 5. NAVN (2nd) — LONG +$23.00
    {
      id: randomUUID(),
      userId,
      symbol: 'NAVN',
      side: 'LONG',
      status: 'CLOSED',
      strategy: 'DAY_TRADE',
      entryDate: '2026-03-26T14:20:03-05:00',
      entryPrice: 12.90,
      shares: 100,
      exitDate: '2026-03-26T14:53:17-05:00',
      exitPrice: 13.13,
      grossPnL: (13.13 - 12.90) * 100, // 23.00
      netPnL: 23.00,
      returnPercent: ((13.13 - 12.90) / 12.90) * 100,
      entryNotes: 'Imported from TOS Account Statement (2nd round trip)',
      createdAt: now,
      updatedAt: now,
    },
    // 6. WYFI — SHORT -$20.64
    // Short sold earlier, covered (BUY TO CLOSE) on 03/26
    // Position adjustment $1,102.52 / 86 shares = $12.82 entry
    // Covered at $13.06
    {
      id: randomUUID(),
      userId,
      symbol: 'WYFI',
      side: 'SHORT',
      status: 'CLOSED',
      strategy: 'DAY_TRADE',
      entryDate: '2026-03-26T11:08:27-05:00', // Position adjustment time
      entryPrice: 12.82, // $1,102.52 / 86 shares
      shares: 86,
      exitDate: '2026-03-26T12:19:25-05:00',
      exitPrice: 13.06,
      grossPnL: (12.82 - 13.06) * 86, // -20.64
      netPnL: -20.64,
      returnPercent: ((12.82 - 13.06) / 12.82) * 100,
      entryNotes: 'Short cover - derived from position adjustment ($1,102.52 / 86 shares)',
      createdAt: now,
      updatedAt: now,
    },
    // 7. PONY — SHORT -$22.00
    // Short sold earlier, covered (BUY TO CLOSE) on 03/26
    // Position adjustment $1,904.00 / 200 shares = $9.52 entry
    // Covered at $9.63
    {
      id: randomUUID(),
      userId,
      symbol: 'PONY',
      side: 'SHORT',
      status: 'CLOSED',
      strategy: 'DAY_TRADE',
      entryDate: '2026-03-26T14:07:36-05:00', // Position adjustment time
      entryPrice: 9.52, // $1,904.00 / 200 shares
      shares: 200,
      exitDate: '2026-03-26T14:18:17-05:00',
      exitPrice: 9.63,
      grossPnL: (9.52 - 9.63) * 200, // -22.00
      netPnL: -22.00,
      returnPercent: ((9.52 - 9.63) / 9.52) * 100,
      entryNotes: 'Short cover - derived from position adjustment ($1,904.00 / 200 shares)',
      createdAt: now,
      updatedAt: now,
    },
  ];

  // Load existing trades and filter out any 03/26 trades
  const existingData = await client.get(`trades:v2:data:${userId}`);
  const existing: Trade[] = existingData ? JSON.parse(existingData).trades || [] : [];
  const kept = existing.filter(t => {
    const dateStr = (t.status === 'CLOSED' && t.exitDate) ? t.exitDate : t.entryDate;
    return !dateStr.startsWith('2026-03-26');
  });

  const final = [...kept, ...trades];
  await client.set(`trades:v2:data:${userId}`, JSON.stringify({ trades: final }));

  // Verify
  console.log('\n=== 03/26 Trades Added ===');
  console.log(`Total trades in DB: ${final.length} (${trades.length} new for 03/26)`);
  console.log('');

  let totalPnL = 0;
  let winners = 0;
  let losers = 0;

  for (const t of trades) {
    const pnl = t.netPnL ?? 0;
    totalPnL += pnl;
    if (pnl > 0) winners++;
    else if (pnl < 0) losers++;

    const emoji = pnl >= 0 ? '+' : '';
    console.log(
      `  ${t.symbol.padEnd(6)} ${t.side.padEnd(5)} ${t.shares.toString().padStart(4)} shares  ` +
      `${t.entryPrice.toFixed(2).padStart(7)} -> ${(t.exitPrice ?? 0).toFixed(2).padStart(7)}  ` +
      `P&L: ${emoji}$${pnl.toFixed(2)}`
    );
  }

  console.log('');
  console.log(`  Winners: ${winners}  |  Losers: ${losers}  |  Win rate: ${((winners / trades.length) * 100).toFixed(0)}%`);
  console.log(`  Total P&L: $${totalPnL.toFixed(2)}`);
  console.log(`  Expected:  $24.25`);
  console.log(`  Match: ${Math.abs(totalPnL - 24.25) < 0.01 ? 'YES' : 'NO (diff: $' + (totalPnL - 24.25).toFixed(2) + ')'}`);

  await client.disconnect();
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
