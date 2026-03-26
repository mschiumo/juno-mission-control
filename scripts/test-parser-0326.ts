/**
 * Test: Parse the 03/26 TOS Account Statement through the flexible parser
 * and verify all 7 trades are correctly produced with correct P&L.
 *
 * Usage: npx tsx scripts/test-parser-0326.ts
 */

import { randomUUID } from 'crypto';
// Polyfill for Node 18
if (typeof globalThis.crypto === 'undefined') {
  (globalThis as any).crypto = { randomUUID };
}

import { parseFlexibleCSV } from '../lib/parsers/flexible-csv-parser';
import { Strategy } from '../types/trading';

// Minimal Account Statement CSV containing just the relevant 03/26 sections
const csvContent = `\ufeffThis document was exported from the paperMoney\u00ae platform which provides a simulated trading environment.

Account Statement for D-69512501 (margin) since 3/25/26 through 3/26/26

Cash Balance
DATE,TIME,TYPE,REF #,DESCRIPTION,Misc Fees,Commissions & Fees,AMOUNT,BALANCE
3/26/26,01:00:00,BAL,,Cash balance at the start of business day 26.03 CST,,,,"98,569.49"
3/26/26,09:33:56,TRD,="5319801833",BOT +105 BATL @6.28,,,-659.40,"97,910.09"
3/26/26,09:42:49,TRD,="5319829237",SOLD -105 BATL @6.61,-0.01,,694.05,"98,604.13"
3/26/26,10:09:08,TRD,="5319878567",BOT +110 AIFF @2.40,,,-264.00,"98,340.13"
3/26/26,10:11:39,TRD,="5319915671",SOLD -110 AIFF @2.09,-0.01,,229.90,"98,570.02"
3/26/26,10:31:22,TRD,="5319963211",BOT +14 KOD @35.22,,,-493.08,"98,076.94"
3/26/26,11:08:27,FND,="5320035362",Position adjustment,,,"1,102.52","99,179.46"
3/26/26,11:44:32,TRD,="5320065320",BOT +75 NAVN @11.35,,,-851.25,"98,328.21"
3/26/26,12:15:53,TRD,="5320108292",SOLD -14 KOD @35.53,-0.01,,497.42,"98,825.62"
3/26/26,12:19:25,TRD,="5320035394",BOT +86 WYFI @13.06,,,"-1,123.16","97,702.46"
3/26/26,12:39:08,TRD,="5320144311",SOLD -75 NAVN @11.87,-0.02,,890.25,"98,592.69"
3/26/26,14:07:36,FND,="5320228099",Position adjustment,,,"1,904.00","100,496.69"
3/26/26,14:18:17,TRD,="5320228716",BOT +200 PONY @9.63,,,"-1,926.00","98,570.69"
3/26/26,14:20:03,TRD,="5320236843",BOT +100 NAVN @12.90,,,"-1,290.00","97,280.69"
3/26/26,14:53:17,TRD,="5320264444",SOLD -100 NAVN @13.13,-0.02,,"1,313.00","98,593.67"

Futures Statements
Trade Date,Exec Date,Exec Time,Type,Ref #,Description,Misc Fees,Commissions & Fees,Amount,Balance

Account Trade History
,Exec Time,Spread,Side,Qty,Pos Effect,Symbol,Exp,Strike,Type,Price,Net Price,Order Type
,3/26/26 14:53:17,STOCK,SELL,-100,TO CLOSE,NAVN,,,STOCK,13.13,13.13,MKT
,3/26/26 14:20:03,STOCK,BUY,+100,TO OPEN,NAVN,,,STOCK,12.90,12.90,STP
,3/26/26 14:18:17,STOCK,BUY,+200,TO CLOSE,PONY,,,STOCK,9.63,9.63,STP
,3/26/26 12:39:08,STOCK,SELL,-75,TO CLOSE,NAVN,,,STOCK,11.87,11.87,MKT
,3/26/26 12:19:25,STOCK,BUY,+86,TO CLOSE,WYFI,,,STOCK,13.06,13.06,STP
,3/26/26 12:15:53,STOCK,SELL,-14,TO CLOSE,KOD,,,STOCK,35.53,35.53,MKT
,3/26/26 11:44:32,STOCK,BUY,+75,TO OPEN,NAVN,,,STOCK,11.35,11.35,STP
,3/26/26 10:31:22,STOCK,BUY,+14,TO OPEN,KOD,,,STOCK,35.22,35.22,STP
,3/26/26 10:11:39,STOCK,SELL,-110,TO CLOSE,AIFF,,,STOCK,2.09,2.09,STP
,3/26/26 10:09:08,STOCK,BUY,+110,TO OPEN,AIFF,,,STOCK,2.40,2.40,STP
,3/26/26 09:42:49,STOCK,SELL,-105,TO CLOSE,BATL,,,STOCK,6.61,6.61,STP
,3/26/26 09:33:56,STOCK,BUY,+105,TO OPEN,BATL,,,STOCK,6.28,6.28,LMT

Profits and Losses
Symbol,Description,P/L Open,P/L %,P/L Day,P/L YTD,P/L Diff,Margin Req,Mark Value
`;

// Expected results
const expected = [
  { symbol: 'BATL', side: 'LONG', shares: 105, entry: 6.28, exit: 6.61, pnl: 34.65 },
  { symbol: 'AIFF', side: 'LONG', shares: 110, entry: 2.40, exit: 2.09, pnl: -34.10 },
  { symbol: 'KOD', side: 'LONG', shares: 14, entry: 35.22, exit: 35.53, pnl: 4.34 },
  { symbol: 'NAVN', side: 'LONG', shares: 75, entry: 11.35, exit: 11.87, pnl: 39.00 },
  { symbol: 'NAVN', side: 'LONG', shares: 100, entry: 12.90, exit: 13.13, pnl: 23.00 },
  { symbol: 'WYFI', side: 'SHORT', shares: 86, entry: 12.82, exit: 13.06, pnl: -20.64 },
  { symbol: 'PONY', side: 'SHORT', shares: 200, entry: 9.52, exit: 9.63, pnl: -22.00 },
];

function main() {
  console.log('Parsing Account Statement through flexible parser...\n');

  const result = parseFlexibleCSV(csvContent, {
    userId: 'test-user',
    defaultStrategy: Strategy.DAY_TRADE,
  });

  console.log(`Success: ${result.success}`);
  console.log(`Imported: ${result.imported}`);
  console.log(`Failed: ${result.failed}`);
  if (result.errors.length > 0) {
    console.log('Errors:', JSON.stringify(result.errors, null, 2));
  }
  console.log('');

  // Sort trades by entry time for consistent comparison
  const trades = result.trades.sort((a, b) => a.entryDate.localeCompare(b.entryDate));

  let totalPnL = 0;
  let allMatch = true;

  console.log('=== Parsed Trades ===');
  for (const t of trades) {
    const pnl = t.netPnL ?? 0;
    totalPnL += pnl;
    const sign = pnl >= 0 ? '+' : '';

    console.log(
      `  ${t.symbol.padEnd(6)} ${t.side.padEnd(5)} ${t.shares.toString().padStart(4)} shares  ` +
      `$${t.entryPrice.toFixed(2).padStart(7)} -> $${(t.exitPrice ?? 0).toFixed(2).padStart(7)}  ` +
      `P&L: ${sign}$${pnl.toFixed(2)}  [${t.status}]`
    );

    // Match by symbol+shares+side (order-independent)
    const exp = expected.find(e =>
      e.symbol === t.symbol && e.side === t.side && e.shares === t.shares
    );
    if (exp) {
      const checks = [
        Math.abs(exp.entry - t.entryPrice) < 0.01,
        Math.abs(exp.exit - (t.exitPrice ?? 0)) < 0.01,
        Math.abs(exp.pnl - pnl) < 0.02,
      ];
      if (!checks.every(Boolean)) {
        console.log(`    MISMATCH! Expected: entry=$${exp.entry} exit=$${exp.exit} P&L=$${exp.pnl}`);
        allMatch = false;
      }
    } else {
      console.log(`    NO MATCH in expected for ${t.symbol} ${t.side} ${t.shares}sh`);
      allMatch = false;
    }
  }

  console.log('');
  console.log(`Total P&L: $${totalPnL.toFixed(2)}`);
  console.log(`Expected:  $24.25`);

  const pnlMatch = Math.abs(totalPnL - 24.25) < 0.02;
  const countMatch = trades.length === 7;
  const openTrades = trades.filter(t => t.status === 'OPEN').length;

  console.log('');
  console.log('=== Verification ===');
  console.log(`Trade count:     ${trades.length}/7  ${countMatch ? 'PASS' : 'FAIL'}`);
  console.log(`Open trades:     ${openTrades}     ${openTrades === 0 ? 'PASS' : 'FAIL (should be 0)'}`);
  console.log(`Total P&L match: ${pnlMatch ? 'PASS' : 'FAIL'}`);
  console.log(`All fields match: ${allMatch ? 'PASS' : 'FAIL'}`);

  if (pnlMatch && countMatch && openTrades === 0 && allMatch) {
    console.log('\nAll tests PASSED!');
    process.exit(0);
  } else {
    console.log('\nSome tests FAILED!');
    process.exit(1);
  }
}

main();
