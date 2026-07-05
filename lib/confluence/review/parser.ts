/**
 * ThinkOrSwim/Schwab "Account Statement" CSV parser for the Performance
 * Review module (source: manual_tos).
 *
 * PURE — no I/O, no Redis, no LLM. Tested against the golden fixture at
 * test/fixtures/2026-07-02-AccountStatement.csv; the numbers it must
 * reproduce are pinned in test/confluence-review/golden-fixture.test.ts.
 *
 * The statement is a multi-section CSV. Sections this parser reads:
 *   - Cash Balance          → misc fees (attached to fills where a TRD row
 *                             matches; day totals otherwise)
 *   - Account Order History → row counts only (REJECTED / TRIGGERED /
 *                             CANCELED partials / STP continuation rows must
 *                             not choke the fill parsing)
 *   - Account Trade History → the fills
 *   - Profits and Losses    → symbol-level YTD P/L, imported as summary
 *                             context (fill detail only covers the recent
 *                             session, so YTD is never reconstructed)
 *
 * Format quirks handled: UTF-8 BOM, quoted fields with embedded commas
 * (thousands separators), parenthesized negatives, `$` prefixes,
 * `="123..."` Excel-escaped ref numbers, and exec timestamps recorded in
 * UTC (converted to America/New_York for session dating — matching the
 * behavior of lib/parsers/tos-parser.ts).
 */

export interface ParsedFill {
  symbol: string;
  side: 'buy' | 'sell';
  qty: number; // positive
  price: number;
  /** Misc fees matched to this fill from the Cash Balance section. */
  fees: number;
  executedAt: string; // ISO UTC
  etDate: string; // YYYY-MM-DD in America/New_York
  etTime: string; // HH:MM:SS in America/New_York
  posEffect?: string;
  orderType?: string;
}

export interface ParsedSymbolPl {
  symbol: string;
  description?: string;
  plDay?: number;
  plYtd: number;
}

export interface OrderHistoryCounts {
  total: number;
  filled: number;
  canceled: number;
  rejected: number;
  triggered: number;
  other: number;
}

export interface ParsedStatement {
  fills: ParsedFill[];
  /** Total misc fees per ET date from the Cash Balance section (positive =
   * cost), whether or not they matched a specific fill. */
  feesByDate: Record<string, number>;
  /** Misc-fee rows that could not be matched to a specific fill. */
  unmatchedFeeRows: number;
  orderHistory: OrderHistoryCounts;
  symbolPl: ParsedSymbolPl[];
  overallPlYtd?: number;
  overallPlDay?: number;
  /** Statement period end (YYYY-MM-DD) — as-of date for the P/L summary. */
  asOfDate?: string;
  warnings: string[];
  rowCounts: { fills: number; orderHistoryRows: number; cashRows: number; plRows: number };
}

/** Fatal parse problem — the import must reject the batch atomically. */
export class StatementParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StatementParseError';
  }
}

const ET_TIMEZONE = 'America/New_York';

/** Section titles that terminate whatever section we're currently in. */
const SECTION_TITLES = [
  'Cash Balance',
  'Futures Statements',
  'Forex Statements',
  'Account Order History',
  'Account Trade History',
  'Equities',
  'Options',
  'Profits and Losses',
  'Forex Account Summary',
  'Account Summary',
];

function isSectionTitle(trimmed: string): boolean {
  return SECTION_TITLES.some((t) => trimmed === t || trimmed.startsWith(`${t} `)) ||
    trimmed.startsWith('Crypto');
}

/** Split one CSV line respecting double quotes (thousands separators live
 * inside quoted fields). Also unwraps `="123..."` Excel escaping. */
export function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      // Doubled quote inside a quoted field = literal quote.
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      out.push(cleanCell(cur));
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cleanCell(cur));
  return out;
}

function cleanCell(raw: string): string {
  let s = raw.trim();
  // ="1234567890" — Excel's keep-as-text escape around ref numbers.
  const excel = s.match(/^="(.*)"$/);
  if (excel) s = excel[1];
  return s.trim();
}

/** Parse "$1,234.56", "($1,234.56)", "-$1.16", "1.5%" → number (parens =
 * negative). Returns undefined for blanks/non-numbers. */
export function parseAmount(raw: string | undefined): number | undefined {
  if (raw === undefined) return undefined;
  let s = raw.trim();
  if (!s || s === 'N/A' || s === '--') return undefined;
  let negative = false;
  if (s.startsWith('(') && s.endsWith(')')) {
    negative = true;
    s = s.slice(1, -1);
  }
  s = s.replace(/[$,%\s]/g, '');
  if (s.startsWith('-')) {
    negative = !negative ? true : negative;
    s = s.slice(1);
  } else if (s.startsWith('+')) {
    s = s.slice(1);
  }
  if (!/^\d*\.?\d+$/.test(s)) return undefined;
  const n = parseFloat(s);
  if (!Number.isFinite(n)) return undefined;
  return negative ? -n : n;
}

/**
 * TOS statements record exec timestamps in UTC. Convert "7/2/26" +
 * "21:24:15" to the UTC instant and the America/New_York session date/time.
 */
export function tosTimestampToEt(
  dateStr: string,
  timeStr: string,
): { executedAt: string; etDate: string; etTime: string } | undefined {
  const m = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!m || !/^\d{1,2}:\d{2}:\d{2}$/.test(timeStr)) return undefined;
  const [, month, day, yearRaw] = m;
  const year = yearRaw.length === 2 ? `20${yearRaw}` : yearRaw;
  const iso = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T${timeStr.padStart(8, '0')}Z`;
  const utc = new Date(iso);
  if (isNaN(utc.getTime())) return undefined;
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: ET_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(utc);
  const get = (type: string) => parts.find((p) => p.type === type)?.value || '';
  let hour = get('hour');
  if (hour === '24') hour = '00';
  return {
    executedAt: utc.toISOString(),
    etDate: `${get('year')}-${get('month')}-${get('day')}`,
    etTime: `${hour}:${get('minute')}:${get('second')}`,
  };
}

interface CashFeeRow {
  executedAt: string;
  etDate: string;
  symbol?: string;
  side?: 'buy' | 'sell';
  qty?: number;
  price?: number;
  fee: number;
  matched: boolean;
}

/** "BOT +500 TZA @3.845" / "SOLD -498 TZA @3.8201" → trade facts. */
function parseTradeDescription(
  desc: string,
): { side: 'buy' | 'sell'; qty: number; symbol: string; price: number } | undefined {
  const m = desc.match(/\b(BOT|SOLD)\s+([+-]?[\d,]+)\s+([A-Z][A-Z0-9./]*)\s+@([\d,.]+)/);
  if (!m) return undefined;
  const qty = Math.abs(parseInt(m[2].replace(/[+,]/g, ''), 10));
  const price = parseFloat(m[4].replace(/,/g, ''));
  if (!qty || !Number.isFinite(price)) return undefined;
  return { side: m[1] === 'BOT' ? 'buy' : 'sell', qty, symbol: m[3], price };
}

/** Normalize newlines, strip BOM, split. */
function toLines(csvText: string): string[] {
  return csvText.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').split('\n');
}

export function parseAccountStatement(csvText: string): ParsedStatement {
  const lines = toLines(csvText);
  const warnings: string[] = [];

  const hasTradeHistory = lines.some((l) => l.trim() === 'Account Trade History');
  const hasCashBalance = lines.some((l) => l.trim() === 'Cash Balance');
  if (!hasTradeHistory && !hasCashBalance) {
    throw new StatementParseError(
      'Not a ThinkOrSwim Account Statement export (no "Account Trade History" or "Cash Balance" section found).',
    );
  }

  // Statement period, e.g. "Account Statement for ... since 7/2/26 through 7/2/26".
  let asOfDate: string | undefined;
  for (const line of lines) {
    const m = line.match(/Account Statement for .* through (\d{1,2}\/\d{1,2}\/\d{2,4})/);
    if (m) {
      const conv = tosTimestampToEt(m[1], '12:00:00');
      // The period label is a plain calendar date, not a UTC instant — take it verbatim.
      const dm = m[1].match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
      if (dm) {
        const year = dm[3].length === 2 ? `20${dm[3]}` : dm[3];
        asOfDate = `${year}-${dm[1].padStart(2, '0')}-${dm[2].padStart(2, '0')}`;
      } else if (conv) {
        asOfDate = conv.etDate;
      }
      break;
    }
  }

  // ---- Section walk ----------------------------------------------------
  type Section = 'none' | 'cash' | 'orders' | 'trades' | 'pl';
  let section: Section = 'none';
  let headerSeen = false;

  const fills: ParsedFill[] = [];
  const cashFees: CashFeeRow[] = [];
  const orderHistory: OrderHistoryCounts = { total: 0, filled: 0, canceled: 0, rejected: 0, triggered: 0, other: 0 };
  const symbolPl: ParsedSymbolPl[] = [];
  let overallPlYtd: number | undefined;
  let overallPlDay: number | undefined;
  let cashRows = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (isSectionTitle(trimmed)) {
      section =
        trimmed === 'Cash Balance'
          ? 'cash'
          : trimmed === 'Account Order History'
            ? 'orders'
            : trimmed === 'Account Trade History'
              ? 'trades'
              : trimmed === 'Profits and Losses'
                ? 'pl'
                : 'none';
      headerSeen = false;
      continue;
    }
    if (section === 'none') continue;

    // Each section's first row after the title is its column header.
    if (!headerSeen) {
      const looksLikeHeader =
        (section === 'cash' && trimmed.includes('DATE') && trimmed.includes('TYPE')) ||
        (section === 'orders' && trimmed.includes('Time Placed') && trimmed.includes('Status')) ||
        (section === 'trades' && trimmed.includes('Exec Time') && trimmed.includes('Side')) ||
        (section === 'pl' && trimmed.includes('P/L YTD'));
      if (looksLikeHeader) headerSeen = true;
      continue;
    }

    const cells = splitCsvLine(line);

    if (section === 'cash') {
      // DATE,TIME,TYPE,REF #,DESCRIPTION,Misc Fees,Commissions & Fees,AMOUNT,BALANCE
      if (cells.length < 9) continue;
      const [dateStr, timeStr, type, , description, miscFeesStr] = cells;
      if (!dateStr.includes('/')) continue; // TOTAL row etc.
      cashRows++;
      const misc = parseAmount(miscFeesStr);
      if (type === 'TRD' && misc !== undefined && misc !== 0) {
        const ts = tosTimestampToEt(dateStr, timeStr);
        if (!ts) {
          warnings.push(`Cash Balance TRD row with unreadable timestamp: "${dateStr} ${timeStr}"`);
          continue;
        }
        const trade = parseTradeDescription(description);
        cashFees.push({
          executedAt: ts.executedAt,
          etDate: ts.etDate,
          symbol: trade?.symbol,
          side: trade?.side,
          qty: trade?.qty,
          price: trade?.price,
          fee: Math.abs(misc),
          matched: false,
        });
      }
      continue;
    }

    if (section === 'orders') {
      // Notes,,Time Placed,Spread,Side,Qty,Pos Effect,Symbol,Exp,Strike,Type,PRICE,,TIF,Status
      // Continuation rows (e.g. the STP leg of a stop order) carry only a
      // price — count them but nothing else. Statuses live in the last cell.
      orderHistory.total++;
      const status = (cells[14] ?? cells[cells.length - 1] ?? '').toUpperCase();
      // Partial cancels render the qty as "(-498) CANCELED" — the status
      // keyword can appear in the qty cell instead of the status column.
      const rowText = cells.join(' ').toUpperCase();
      if (status === 'FILLED') orderHistory.filled++;
      else if (status.includes('CANCELED') || rowText.includes('CANCELED')) orderHistory.canceled++;
      else if (status === 'REJECTED') orderHistory.rejected++;
      else if (status === 'TRIGGERED') orderHistory.triggered++;
      else orderHistory.other++;
      continue;
    }

    if (section === 'trades') {
      // ,Exec Time,Spread,Side,Qty,Pos Effect,Symbol,Exp,Strike,Type,Price,Net Price,Order Type
      if (cells.length < 11) continue;
      const execTime = cells[1];
      const sideRaw = cells[3].toUpperCase();
      const qtyRaw = cells[4];
      const posEffect = cells[5];
      const symbol = cells[6];
      const priceRaw = cells[10];
      const orderType = cells[12] || undefined;

      if (!execTime.includes('/')) continue; // stray subtotal rows
      if (sideRaw !== 'BUY' && sideRaw !== 'SELL') {
        warnings.push(`Trade History row with unrecognized side "${cells[3]}" skipped.`);
        continue;
      }
      const spaceIdx = execTime.indexOf(' ');
      if (spaceIdx === -1) continue;
      const ts = tosTimestampToEt(execTime.slice(0, spaceIdx), execTime.slice(spaceIdx + 1));
      if (!ts) {
        warnings.push(`Trade History row with unreadable exec time "${execTime}" skipped.`);
        continue;
      }
      const qty = Math.abs(parseInt(qtyRaw.replace(/[+,]/g, ''), 10) || 0);
      const price = parseAmount(priceRaw);
      if (!symbol || qty <= 0 || price === undefined || price <= 0) {
        warnings.push(`Trade History row for "${symbol || '?'}" with invalid qty/price skipped.`);
        continue;
      }
      fills.push({
        symbol,
        side: sideRaw === 'BUY' ? 'buy' : 'sell',
        qty,
        price,
        fees: 0,
        executedAt: ts.executedAt,
        etDate: ts.etDate,
        etTime: ts.etTime,
        posEffect: posEffect || undefined,
        orderType,
      });
      continue;
    }

    if (section === 'pl') {
      // Symbol,Description,P/L Open,P/L %,P/L Day,P/L YTD,P/L Diff,Margin Req,Mark Value
      if (cells.length < 6) continue;
      const symbol = cells[0];
      const description = cells[1];
      const plDay = parseAmount(cells[4]);
      const plYtd = parseAmount(cells[5]);
      if (!symbol && description.toUpperCase().includes('OVERALL')) {
        overallPlDay = plDay;
        overallPlYtd = plYtd;
        continue;
      }
      if (!symbol || plYtd === undefined) continue;
      symbolPl.push({ symbol, description: description || undefined, plDay, plYtd });
      continue;
    }
  }

  // ---- Attach misc fees to fills ----------------------------------------
  // Match each Cash Balance TRD fee row to its fill by (UTC instant, symbol,
  // side, qty, price) parsed from the row's description. Anything left
  // unmatched still counts toward the day totals + fee drag.
  let unmatchedFeeRows = 0;
  const feesByDate: Record<string, number> = {};
  for (const feeRow of cashFees) {
    feesByDate[feeRow.etDate] = round2((feesByDate[feeRow.etDate] || 0) + feeRow.fee);
    const fill =
      feeRow.symbol !== undefined
        ? fills.find(
            (f) =>
              f.fees === 0 &&
              f.executedAt === feeRow.executedAt &&
              f.symbol === feeRow.symbol &&
              f.side === feeRow.side &&
              f.qty === feeRow.qty &&
              (feeRow.price === undefined || Math.abs(f.price - feeRow.price) < 1e-9),
          )
        : undefined;
    if (fill) {
      fill.fees = round2(fill.fees + feeRow.fee);
      feeRow.matched = true;
    } else {
      unmatchedFeeRows++;
    }
  }
  if (unmatchedFeeRows > 0) {
    warnings.push(
      `${unmatchedFeeRows} misc-fee row(s) in Cash Balance could not be matched to a specific fill; they still count in day totals.`,
    );
  }

  fills.sort((a, b) => a.executedAt.localeCompare(b.executedAt) || a.symbol.localeCompare(b.symbol));

  return {
    fills,
    feesByDate,
    unmatchedFeeRows,
    orderHistory,
    symbolPl,
    overallPlYtd,
    overallPlDay,
    asOfDate,
    warnings,
    rowCounts: {
      fills: fills.length,
      orderHistoryRows: orderHistory.total,
      cashRows,
      plRows: symbolPl.length,
    },
  };
}

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
