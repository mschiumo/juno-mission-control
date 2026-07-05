/**
 * Deterministic generator for the Performance Review golden fixture:
 *   test/fixtures/2026-07-02-AccountStatement.csv
 *
 * The real 2026-07-02 ThinkOrSwim statement was not available in the repo, so
 * this synthesizes a statement that reproduces, exactly, every number pinned
 * in MILESTONE R's golden-fixture spec (11 round trips incl. the TZA short
 * and the 2/498 split exit, per-symbol gross P/L, $1.16 misc fees, 158 P/L
 * symbols summing to −$1,095.28) plus every format quirk the parser must
 * survive (BOM, ="..." refs, parenthesized negatives, quoted thousands,
 * REJECTED/TRIGGERED/CANCELED-partial rows, STP continuation rows).
 *
 * If the real statement export is ever placed at that path instead, the
 * golden tests assert only the spec numbers above — they hold for both files.
 *
 * Usage: node scripts/generate-review-fixture.mjs
 */

import { writeFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'test', 'fixtures', '2026-07-02-AccountStatement.csv');

// ---- The 22 fills (UTC exec times; ET = UTC−4 on 2026-07-02) --------------
// Gross by symbol: TZA −6.44, MSTR +5.76, CWD +1.55, CONL +0.31 → +1.18.
const D = '7/2/26';
const fills = [
  // RT1 TZA long +5.00 (fee $0.29 on the sell)
  { t: '13:31:05', side: 'BUY', qty: 500, sym: 'TZA', px: 3.8, type: 'LMT' },
  { t: '13:45:10', side: 'SELL', qty: 500, sym: 'TZA', px: 3.81, type: 'LMT', fee: 0.29 },
  // RT2 TZA long +3.00
  { t: '14:02:00', side: 'BUY', qty: 500, sym: 'TZA', px: 3.82, type: 'LMT' },
  { t: '14:20:30', side: 'SELL', qty: 500, sym: 'TZA', px: 3.826, type: 'LMT' },
  // MSTR long +5.76
  { t: '14:10:00', side: 'BUY', qty: 2, sym: 'MSTR', px: 402.5, type: 'LMT' },
  { t: '15:30:00', side: 'SELL', qty: 2, sym: 'MSTR', px: 405.38, type: 'LMT' },
  // RT3 TZA long +3.00
  { t: '14:35:00', side: 'BUY', qty: 300, sym: 'TZA', px: 3.83, type: 'LMT' },
  { t: '14:50:00', side: 'SELL', qty: 300, sym: 'TZA', px: 3.84, type: 'LMT' },
  // RT4 TZA long −4.00 (stopped out — pairs with the TRIGGERED order row)
  { t: '15:10:00', side: 'BUY', qty: 400, sym: 'TZA', px: 3.85, type: 'LMT' },
  { t: '15:22:45', side: 'SELL', qty: 400, sym: 'TZA', px: 3.84, type: 'STP' },
  // CWD long +1.55
  { t: '15:45:00', side: 'BUY', qty: 50, sym: 'CWD', px: 14.2, type: 'LMT' },
  { t: '16:25:00', side: 'SELL', qty: 50, sym: 'CWD', px: 14.231, type: 'LMT' },
  // RT5 TZA long +3.00
  { t: '16:05:00', side: 'BUY', qty: 200, sym: 'TZA', px: 3.81, type: 'LMT' },
  { t: '16:40:00', side: 'SELL', qty: 200, sym: 'TZA', px: 3.825, type: 'LMT' },
  // CONL long +0.31
  { t: '17:05:00', side: 'BUY', qty: 10, sym: 'CONL', px: 20.85, type: 'LMT' },
  { t: '18:05:00', side: 'SELL', qty: 10, sym: 'CONL', px: 20.881, type: 'LMT' },
  // RT6 TZA long +0.85
  { t: '17:15:00', side: 'BUY', qty: 100, sym: 'TZA', px: 3.795, type: 'LMT' },
  { t: '17:55:00', side: 'SELL', qty: 100, sym: 'TZA', px: 3.8035, type: 'LMT' },
  // RT7 TZA long, SPLIT EXIT (2 @ 3.85 + 498 @ 3.8201) → −12.39 (fee $0.29)
  { t: '18:30:00', side: 'BUY', qty: 500, sym: 'TZA', px: 3.845, type: 'LMT' },
  { t: '19:10:00', side: 'SELL', qty: 2, sym: 'TZA', px: 3.85, type: 'LMT' },
  { t: '19:45:00', side: 'SELL', qty: 498, sym: 'TZA', px: 3.8201, type: 'LMT', fee: 0.29 },
  // RT8 TZA SHORT (SELL TO OPEN 500 @ 3.8101 at 21:24:15) → −4.90 (fee $0.58)
  { t: '21:24:15', side: 'SELL', qty: 500, sym: 'TZA', px: 3.8101, type: 'LMT', open: true, fee: 0.58 },
  { t: '21:40:00', side: 'BUY', qty: 500, sym: 'TZA', px: 3.8199, type: 'LMT', close: true },
];

// Position-effect bookkeeping so TO OPEN / TO CLOSE come out right.
const pos = new Map();
for (const f of fills) {
  const p = pos.get(f.sym) ?? 0;
  const signed = f.side === 'BUY' ? f.qty : -f.qty;
  f.effect = p === 0 ? 'TO OPEN' : Math.abs(p + signed) < Math.abs(p) || p + signed === 0 ? 'TO CLOSE' : 'TO OPEN';
  pos.set(f.sym, p + signed);
}

const cents = (n) => Math.round(n * 100);
const money = (c) => {
  const abs = Math.abs(c);
  const s = `$${Math.floor(abs / 100).toLocaleString('en-US')}.${String(abs % 100).padStart(2, '0')}`;
  return c < 0 ? `(${s})` : s;
};
const csvMoney = (c) => {
  const m = money(c);
  return m.includes(',') ? `"${m}"` : m;
};

// ---- Cash Balance section --------------------------------------------------
const cashRows = [];
let balance = cents(10000);
cashRows.push(`${D},13:00:00,BAL,,Cash balance at the start of business day 02.07.2026,,,,${csvMoney(balance)}`);
let ref = 19876543210;
const chrono = [...fills].sort((a, b) => a.t.localeCompare(b.t));
for (const f of chrono) {
  const gross = cents(f.qty * f.px);
  const feeC = cents(f.fee ?? 0);
  const amount = (f.side === 'BUY' ? -gross : gross) - feeC;
  balance += amount;
  const desc = `${f.side === 'BUY' ? 'BOT' : 'SOLD'} ${f.side === 'BUY' ? '+' : '-'}${f.qty} ${f.sym} @${f.px}`;
  const misc = feeC ? `-$${(feeC / 100).toFixed(2)}` : '';
  cashRows.push(`${D},${f.t},TRD,="${ref++}",${desc},${misc},,${csvMoney(amount)},${csvMoney(balance)}`);
}
cashRows.push(`,,,,TOTAL,-$1.16,,${csvMoney(balance - cents(10000))},`);

// ---- Account Order History (incl. the quirks) -------------------------------
const orderRows = [
  // A rejected oversize order the parser must skip gracefully.
  `,,${D} 13:29:50,STOCK,BUY,+5000,TO OPEN,TZA,,,,3.80 LMT,,DAY,REJECTED`,
  `,,${D} 13:30:40,STOCK,BUY,+500,TO OPEN,TZA,,,,3.80 LMT,,DAY,FILLED`,
  `,,${D} 13:44:55,STOCK,SELL,-500,TO CLOSE,TZA,,,,3.81 LMT,,DAY,FILLED`,
  // Stop order: TRIGGERED row + continuation row carrying only the stop price.
  `,,${D} 15:09:00,STOCK,SELL,-400,TO CLOSE,TZA,,,STP,,,DAY,TRIGGERED`,
  `,,,,,,,,,,,3.84 STP,,,`,
  // Partially canceled exit — the (-498) CANCELED qty form.
  `,,${D} 19:40:00,STOCK,SELL,(-498) CANCELED,TO CLOSE,TZA,,,,3.83 LMT,,DAY,CANCELED`,
  `,,${D} 19:44:30,STOCK,SELL,-498,TO CLOSE,TZA,,,,3.8201 LMT,,DAY,FILLED`,
  `,,${D} 21:23:50,STOCK,SELL,-500,TO OPEN,TZA,,,,3.8101 LMT,,DAY,FILLED`,
  `,,${D} 21:39:40,STOCK,BUY,+500,TO CLOSE,TZA,,,,3.8199 LMT,,DAY,FILLED`,
];

// ---- Account Trade History ---------------------------------------------------
const tradeRows = chrono.map(
  (f) =>
    `,${D} ${f.t},STOCK,${f.side},${f.side === 'BUY' ? '+' : '-'}${f.qty},${f.effect},${f.sym},,,,${f.px},${f.px},${f.type}`,
);

// ---- Profits and Losses: 158 symbols, OVERALL P/L YTD −$1,095.28 -------------
const dayPl = { TZA: -644, MSTR: 576, CWD: 155, CONL: 31 };
const plSymbols = [];
const traded = ['TZA', 'MSTR', 'CWD', 'CONL'];
const ytdTraded = { TZA: -21550, MSTR: 4212, CWD: -1305, CONL: 890 };
for (const sym of traded) plSymbols.push({ sym, day: dayPl[sym], ytd: ytdTraded[sym] });

// 154 more symbols with deterministic YTD values; the last one balances the
// sum to exactly −$1,095.28. At least one uses a quoted-thousands negative.
const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const extras = [];
for (let i = 0; extras.length < 154; i++) {
  const sym = `${alphabet[Math.floor(i / 26) % 26]}${alphabet[i % 26]}X`;
  if (traded.includes(sym)) continue;
  extras.push(sym);
}
const TARGET_YTD = -109528;
let runningYtd = plSymbols.reduce((s, r) => s + r.ytd, 0);
for (let i = 0; i < 153; i++) {
  const val = ((i * 137 + 41) % 500) * (i % 2 === 0 ? -1 : 1) * 7 + (i % 100); // cents
  const ytd = i === 5 ? -123456 : val; // one "($1,234.56)" row
  plSymbols.push({ sym: extras[i], day: 0, ytd });
  runningYtd += ytd;
}
plSymbols.push({ sym: extras[153], day: 0, ytd: TARGET_YTD - runningYtd });

const plRows = plSymbols.map(
  ({ sym, day, ytd }) =>
    `${sym},SYNTHETIC FIXTURE ${sym},$0.00,0.00%,${csvMoney(day)},${csvMoney(ytd)},$0.00,$0.00,$0.00`,
);
const overallDay = plSymbols.reduce((s, r) => s + r.day, 0);
plRows.push(`,OVERALL TOTALS,$0.00,0.00%,${csvMoney(overallDay)},${csvMoney(TARGET_YTD)},$0.00,$0.00,$0.00`);

// ---- Assemble ----------------------------------------------------------------
const out = [
  '\uFEFF' +
    'This document is a SYNTHETIC GOLDEN FIXTURE generated by scripts/generate-review-fixture.mjs, mirroring a paperMoney® ThinkOrSwim Account Statement export. All data is for testing only.',
  '',
  'Account Statement for 462XXXXXX (Individual) since 7/2/26 through 7/2/26',
  '',
  'Cash Balance',
  'DATE,TIME,TYPE,REF #,DESCRIPTION,Misc Fees,Commissions & Fees,AMOUNT,BALANCE',
  ...cashRows,
  '',
  'Futures Statements',
  'Trade Date,Exec Date,Exec Time,Type,Ref #,Description,Misc Fees,Commissions & Fees,Amount,Balance',
  '',
  'Forex Statements',
  ',Date,Time,Type,Ref #,Description,Commissions & Fees,Amount,Amount(USD),Balance',
  '',
  'Crypto (trading provided by Schwab Digital Assets) Statements',
  'Trade Date,Exec Date,Exec Time,Type,Ref #,Description,Commissions & Fees,Amount,Balance',
  '',
  ' ',
  `"Total Cash ${money(balance)}"`,
  '',
  'Account Order History',
  'Notes,,Time Placed,Spread,Side,Qty,Pos Effect,Symbol,Exp,Strike,Type,PRICE,,TIF,Status',
  ...orderRows,
  '',
  'Account Trade History',
  ',Exec Time,Spread,Side,Qty,Pos Effect,Symbol,Exp,Strike,Type,Price,Net Price,Order Type',
  ...tradeRows,
  '',
  'Equities',
  'Symbol,Description,Qty,Trade Price,Mark,Mark Value',
  ',OVERALL TOTALS,,,,$0.00',
  '',
  'Profits and Losses',
  'Symbol,Description,P/L Open,P/L %,P/L Day,P/L YTD,P/L Diff,Margin Req,Mark Value',
  ...plRows,
  '',
  'Account Summary',
  'Net Liquidating Value,"$10,000.02"',
  'Stock Buying Power,"$20,000.04"',
  'Option Buying Power,"$10,000.02"',
  '',
].join('\r\n');

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, out, 'utf8');

// Sanity: recompute the pinned goldens from the fill list before declaring done.
const grossBySym = {};
for (const f of fills) {
  const signed = (f.side === 'SELL' ? 1 : -1) * f.qty * f.px;
  grossBySym[f.sym] = (grossBySym[f.sym] ?? 0) + signed;
}
const round2 = (n) => Math.round(n * 100) / 100;
const expect = { TZA: -6.44, MSTR: 5.76, CWD: 1.55, CONL: 0.31 };
for (const [sym, want] of Object.entries(expect)) {
  const got = round2(grossBySym[sym]);
  if (got !== want) throw new Error(`Gross P/L mismatch for ${sym}: ${got} != ${want}`);
}
const totalYtd = plSymbols.reduce((s, r) => s + r.ytd, 0);
if (totalYtd !== TARGET_YTD) throw new Error(`YTD sum ${totalYtd} != ${TARGET_YTD}`);
if (plSymbols.length !== 158) throw new Error(`P/L symbols ${plSymbols.length} != 158`);
const feeTotal = fills.reduce((s, f) => s + (f.fee ?? 0), 0);
if (round2(feeTotal) !== 1.16) throw new Error(`Fees ${feeTotal} != 1.16`);
console.log(`Wrote ${OUT}`);
console.log(`  fills=${fills.length} plSymbols=${plSymbols.length} fees=$${feeTotal.toFixed(2)} sessionGross=$${round2(Object.values(grossBySym).reduce((a, b) => a + b, 0)).toFixed(2)}`);
