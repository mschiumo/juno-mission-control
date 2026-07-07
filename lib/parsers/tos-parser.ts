export interface TOSTrade {
  id?: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  quantity: number;
  price: number;
  date: string; // ISO date YYYY-MM-DD in EST
  time: string; // HH:MM:SS
  execTime: string; // Original format
  posEffect?: string; // TO OPEN / TO CLOSE
  orderType?: string; // MKT, LMT, etc
  pnl?: number; // Calculated on round trips
}

export interface RawPositionAdjustment {
  date: string;   // YYYY-MM-DD
  time: string;   // HH:MM:SS
  amount: number; // Positive dollar amount
}

export interface DailyBalance {
  date: string;    // YYYY-MM-DD (ET local)
  balance: number; // End-of-day balance (latest BALANCE column value on that ET date)
}

export interface DailyFee {
  date: string;   // YYYY-MM-DD (ET local)
  amount: number; // Total fees charged on this date (positive = cost to account)
  // Breakdown of `amount`. Older stored records may omit these (total only).
  commissions?: number; // TRD-derived: Misc Fees + Commissions & Fees (matches Schwab's "Total Commissions & Fees")
  borrow?: number;      // JRN-derived: stock borrow fees & other journal debits
}

export interface TOSAccountStatementResult {
  trades: TOSTrade[];
  positionAdjustments: RawPositionAdjustment[];
  startingBalance?: number;
  dailyBalances: DailyBalance[];
  dailyFees: DailyFee[];
  // Number of data rows in the Cash Balance section. Zero means the export
  // omitted that section entirely (fees/balances can't be derived), which the
  // import flow surfaces as a warning so a re-import doesn't silently no-op.
  cashBalanceRows: number;
}

export interface DayData {
  date: string;
  pnl: number;
  trades: number;
  winRate?: number;
  hasJournal?: boolean;
  avgCost?: number;
  sharpeRatio?: number;
}

const EST_TIMEZONE = 'America/New_York';
const EST_OFFSET = '-05:00';

function getTodayInEST(): string {
  const now = new Date();
  const estDateStr = now.toLocaleDateString('en-US', {
    timeZone: EST_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  const [month, day, year] = estDateStr.split('/');
  return `${year}-${month}-${day}`;
}

function getCurrentTimeInEST(): string {
  const now = new Date();
  return now.toLocaleTimeString('en-US', {
    timeZone: EST_TIMEZONE,
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}

function getNowInEST(): string {
  const now = new Date();
  const estDateStr = now.toLocaleString('en-US', {
    timeZone: EST_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
  const [datePart, timePart] = estDateStr.split(', ');
  const [month, day, year] = datePart.split('/');
  return `${year}-${month}-${day}T${timePart}${EST_OFFSET}`;
}

/**
 * TOS Account Statement exports record fill timestamps in UTC, even though
 * descriptive text labels them "CST" (the broker's home timezone). Without
 * converting, after-hours trades that happen past 8 PM ET roll into the next
 * UTC calendar day and get assigned the wrong trading date — breaking
 * round-trip matching and daily P&L.
 */
function convertUTCDateTimeToET(dateStr: string, timeStr: string): { date: string; time: string } {
  if (!dateStr || !timeStr) return { date: '', time: timeStr };
  const [month, day, yearShort] = dateStr.split('/');
  if (!month || !day || !yearShort) return { date: '', time: timeStr };
  const year = yearShort.length === 2 ? '20' + yearShort : yearShort;
  const utcISO = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T${timeStr}Z`;
  const utcDate = new Date(utcISO);
  if (isNaN(utcDate.getTime())) {
    return {
      date: `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`,
      time: timeStr,
    };
  }
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: EST_TIMEZONE,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  }).formatToParts(utcDate);
  const get = (type: string) => parts.find(p => p.type === type)?.value || '';
  let hour = get('hour');
  if (hour === '24') hour = '00';
  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    time: `${hour}:${get('minute')}:${get('second')}`,
  };
}

/**
 * Parse a TOS Account Statement returning both trades and position adjustments.
 */
export function parseTOSAccountStatementFull(csvText: string): TOSAccountStatementResult {
  const trades = parseTOSAccountStatement(csvText);
  const positionAdjustments = parseCashBalanceAdjustments(csvText);
  const startingBalance = parseCashBalanceStartingBalance(csvText);
  const dailyBalances = parseDailyBalances(csvText);
  const dailyFees = parseDailyFees(csvText);
  const cashBalanceRows = countCashBalanceRows(csvText);
  return { trades, positionAdjustments, startingBalance, dailyBalances, dailyFees, cashBalanceRows };
}

export function parseTOSCSV(csvText: string): TOSTrade[] {
  if (csvText.includes('Account Statement for') && csvText.includes('Account Trade History')) {
    return parseTOSAccountStatement(csvText);
  }
  if ((csvText.includes('Position Statement for') || csvText.includes('Account Statement')) && csvText.includes('P/L Day')) {
    return parseTOSPositionStatement(csvText);
  }
  if (csvText.includes('Statement for') && csvText.includes('P/L Day')) {
    return parseTOSPositionStatement(csvText);
  }
  if (csvText.includes("Today's Trade Activity") || csvText.includes('Filled Orders')) {
    return parseTOSTradeActivity(csvText);
  }
  return parseTOSStatement(csvText);
}

function parseTOSAccountStatement(csvText: string): TOSTrade[] {
  const lines = csvText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter(line => line.trim());
  const trades: TOSTrade[] = [];
  let inTradeHistory = false;
  let headerFound = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === 'Account Trade History') {
      inTradeHistory = true;
      headerFound = false;
      continue;
    }
    if (!inTradeHistory) continue;
    if (!headerFound) {
      if (trimmed.includes('Exec Time') && trimmed.includes('Spread')) {
        headerFound = true;
      }
      continue;
    }
    if (!line.startsWith(',')) {
      inTradeHistory = false;
      continue;
    }

    const parts = line.split(',').map(p => p.trim());
    if (parts.length < 11) continue;

    const execTime = parts[1];
    const side = parts[3] as 'BUY' | 'SELL';
    const qtyStr = parts[4];
    const posEffect = parts[5];
    const symbol = parts[6];
    const priceStr = parts[10];
    const orderType = parts[12] || 'MKT';

    if (!execTime || !execTime.includes('/')) continue;
    if (!symbol || !side || (side !== 'BUY' && side !== 'SELL')) continue;

    const quantity = Math.abs(parseInt(qtyStr.replace(/[+,]/g, ''), 10) || 0);
    const price = parseFloat(priceStr) || 0;
    if (quantity <= 0 || price <= 0) continue;

    const spaceIdx = execTime.indexOf(' ');
    if (spaceIdx === -1) continue;
    const datePart = execTime.slice(0, spaceIdx);
    const timePart = execTime.slice(spaceIdx + 1);

    const { date: isoDate, time: localTime } = convertUTCDateTimeToET(datePart, timePart);
    if (!isoDate) continue;

    trades.push({
      id: `${symbol}-${isoDate}-${localTime.replace(/:/g, '-')}-${Math.random().toString(36).substr(2, 9)}`,
      symbol, side, quantity, price,
      date: isoDate, time: localTime, execTime, posEffect, orderType
    });
  }
  return trades;
}

/**
 * Parse position adjustments from the Cash Balance section.
 * Returns raw FND entries — matching to trades is done in flexible-csv-parser.
 */
function parseCashBalanceAdjustments(csvText: string): RawPositionAdjustment[] {
  const lines = csvText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const adjustments: RawPositionAdjustment[] = [];
  let inCashBalance = false;
  let headerFound = false;

  const SECTION_HEADERS = [
    'Futures Statements', 'Forex Statements', 'Account Order History',
    'Account Trade History', 'Profits and Losses', 'Crypto',
  ];

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed === 'Cash Balance') {
      inCashBalance = true;
      headerFound = false;
      continue;
    }
    if (inCashBalance && !headerFound && trimmed.includes('DATE') && trimmed.includes('TYPE')) {
      headerFound = true;
      continue;
    }
    if (inCashBalance && headerFound && SECTION_HEADERS.some(h => trimmed.startsWith(h))) {
      inCashBalance = false;
      continue;
    }
    if (!inCashBalance || !headerFound) continue;

    const parts = splitCSVLine(line);
    if (parts.length < 9) continue;

    const dateStr = parts[0].trim();
    const timeStr = parts[1].trim();
    const type = parts[2].trim();
    const description = parts[4].trim();
    const amountStr = parts[7].trim();

    if (!dateStr || !dateStr.includes('/')) continue;
    if (type !== 'FND' || description !== 'Position adjustment') continue;

    const { date: isoDate, time: localTime } = convertUTCDateTimeToET(dateStr, timeStr);
    if (!isoDate) continue;

    const amount = parseQuotedAmount(amountStr);
    if (amount === 0) continue;

    adjustments.push({ date: isoDate, time: localTime, amount: Math.abs(amount) });
  }
  return adjustments;
}

/**
 * Walk the Cash Balance section and return the end-of-day balance for every
 * ET date that has any activity (BAL, TRD, CRC, DOI, etc.). The "end-of-day"
 * value is the latest BALANCE column entry for that ET date — every row in
 * this section reports a running balance, so the latest timestamp wins.
 *
 * As daily statements are uploaded over time, daily balances accumulate
 * naturally: each new file fills in its own date range. Merging across
 * uploads happens in the storage layer.
 */
export function parseDailyBalances(csvText: string): DailyBalance[] {
  const lines = csvText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  let inCashBalance = false;
  let headerFound = false;

  const SECTION_HEADERS = [
    'Futures Statements', 'Forex Statements', 'Account Order History',
    'Account Trade History', 'Profits and Losses', 'Crypto',
  ];

  // Track the latest (highest UTC timestamp) balance entry per ET date.
  const byDate = new Map<string, { ts: number; balance: number }>();

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed === 'Cash Balance') {
      inCashBalance = true;
      headerFound = false;
      continue;
    }
    if (inCashBalance && !headerFound && trimmed.includes('DATE') && trimmed.includes('TYPE')) {
      headerFound = true;
      continue;
    }
    if (inCashBalance && headerFound && SECTION_HEADERS.some(h => trimmed.startsWith(h))) {
      break;
    }
    if (!inCashBalance || !headerFound) continue;

    const parts = splitCSVLine(line);
    if (parts.length < 9) continue;

    const dateStr = parts[0].trim();
    const timeStr = parts[1].trim();
    const balanceStr = parts[8].trim();

    if (!dateStr || !dateStr.includes('/') || !timeStr || !balanceStr) continue;

    // Re-derive the UTC timestamp for ordering; convertUTCDateTimeToET only
    // returns the ET-local date+time, so we compute the UTC instant here.
    const [m, d, yShort] = dateStr.split('/');
    if (!m || !d || !yShort) continue;
    const year = yShort.length === 2 ? '20' + yShort : yShort;
    const utcInstant = new Date(`${year}-${m.padStart(2, '0')}-${d.padStart(2, '0')}T${timeStr}Z`);
    if (isNaN(utcInstant.getTime())) continue;
    const ts = utcInstant.getTime();

    const { date: isoDate } = convertUTCDateTimeToET(dateStr, timeStr);
    if (!isoDate) continue;

    const balance = parseQuotedAmount(balanceStr);
    const existing = byDate.get(isoDate);
    // Use >= so that later rows in file order override earlier ones when
    // timestamps tie. TOS emits multi-leg fills (one order broken across
    // multiple BALANCE rows at the same broker timestamp) in execution
    // order — the *last* row reflects the post-fill running balance.
    if (!existing || ts >= existing.ts) {
      byDate.set(isoDate, { ts, balance });
    }
  }

  return [...byDate.entries()]
    .map(([date, { balance }]) => ({ date, balance }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Extract the earliest starting balance from the Cash Balance section.
 * Looks for BAL-type entries ("Cash balance at the start of business day").
 */
function parseCashBalanceStartingBalance(csvText: string): number | undefined {
  const lines = csvText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  let inCashBalance = false;
  let headerFound = false;
  const balByDate = new Map<string, number>();
  let firstTradeDate = '';

  const SECTION_HEADERS = [
    'Futures Statements', 'Forex Statements', 'Account Order History',
    'Account Trade History', 'Profits and Losses', 'Crypto',
  ];

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed === 'Cash Balance') {
      inCashBalance = true;
      headerFound = false;
      continue;
    }
    if (inCashBalance && !headerFound && trimmed.includes('DATE') && trimmed.includes('TYPE')) {
      headerFound = true;
      continue;
    }
    if (inCashBalance && headerFound && SECTION_HEADERS.some(h => trimmed.startsWith(h))) {
      break;
    }
    if (!inCashBalance || !headerFound) continue;

    const parts = splitCSVLine(line);
    if (parts.length < 9) continue;

    const dateStr = parts[0].trim();
    const type = parts[2].trim();
    const balanceStr = parts[8].trim();

    if (!dateStr || !dateStr.includes('/')) continue;

    const dateParts = dateStr.split('/');
    if (dateParts.length !== 3) continue;
    const [month, day, yearShort] = dateParts;
    const isoDate = `20${yearShort}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;

    if (type === 'BAL') {
      balByDate.set(isoDate, parseQuotedAmount(balanceStr));
    } else if (type === 'TRD') {
      // Track the earliest trading day in the file. The "start of business
      // day" BAL for that date is the right starting capital for the session.
      if (!firstTradeDate || isoDate < firstTradeDate) {
        firstTradeDate = isoDate;
      }
    }
  }

  // Prefer the start-of-day balance on the first trading day. This is the
  // capital actually deployed against trades (post-deposit, pre-trades) and
  // matches what users see at the top of the Cash Balance section in TOS.
  if (firstTradeDate && balByDate.has(firstTradeDate)) {
    const bal = balByDate.get(firstTradeDate)!;
    if (bal > 0) return bal;
  }

  // Fallback: earliest non-zero BAL anywhere in the file (covers files with
  // no trades, e.g. a balance-only export after a deposit).
  let earliestDate = '';
  let earliestBalance: number | undefined;
  for (const [date, bal] of balByDate) {
    if (bal > 0 && (!earliestDate || date < earliestDate)) {
      earliestDate = date;
      earliestBalance = bal;
    }
  }
  return earliestBalance;
}

// Section headers that terminate the Cash Balance section of a TOS statement.
const CASH_BALANCE_END_HEADERS = [
  'Futures Statements', 'Forex Statements', 'Account Order History',
  'Account Trade History', 'Profits and Losses', 'Crypto',
];

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Parse broker fees from the Cash Balance section, split into two buckets so
 * the UI can reconcile against the broker's own figures:
 *  - commissions: TRD rows, "Misc Fees" (index 5, regulatory/exchange fees) +
 *    "Commissions & Fees" (index 6). Sums to Schwab's "Total Commissions & Fees".
 *  - borrow: JRN rows with a negative AMOUNT (stock borrow fees, other debits).
 * Returns per-ET-date totals (positive = cost to the account).
 */
export function parseDailyFees(csvText: string): DailyFee[] {
  const lines = csvText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  let inCashBalance = false;
  let headerFound = false;
  const byDate = new Map<string, { commissions: number; borrow: number }>();

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === 'Cash Balance') { inCashBalance = true; headerFound = false; continue; }
    if (inCashBalance && !headerFound && trimmed.includes('DATE') && trimmed.includes('TYPE')) {
      headerFound = true;
      continue;
    }
    if (inCashBalance && headerFound && CASH_BALANCE_END_HEADERS.some(h => trimmed.startsWith(h))) break;
    if (!inCashBalance || !headerFound) continue;

    const parts = splitCSVLine(line);
    if (parts.length < 8) continue;

    const dateStr = parts[0].trim();
    const timeStr = parts[1].trim();
    const type = parts[2].trim();
    if (!dateStr || !dateStr.includes('/') || !timeStr) continue;

    const { date: isoDate } = convertUTCDateTimeToET(dateStr, timeStr);
    if (!isoDate) continue;

    let commissions = 0;
    let borrow = 0;

    if (type === 'TRD') {
      // Misc Fees (regulatory/exchange fees) + Commissions & Fees
      const miscStr = parts[5]?.trim();
      const commStr = parts[6]?.trim();
      if (miscStr) commissions += Math.abs(parseQuotedAmount(miscStr));
      if (commStr) commissions += Math.abs(parseQuotedAmount(commStr));
    } else if (type === 'JRN') {
      // Journal charges: stock borrow fees, regulatory fees, etc.
      const amountStr = parts[7]?.trim();
      const amount = parseQuotedAmount(amountStr);
      if (amount < 0) borrow = Math.abs(amount); // Only debit journal entries count as fees
    }

    if (commissions > 0 || borrow > 0) {
      const cur = byDate.get(isoDate) || { commissions: 0, borrow: 0 };
      cur.commissions += commissions;
      cur.borrow += borrow;
      byDate.set(isoDate, cur);
    }
  }

  return [...byDate.entries()]
    .map(([date, { commissions, borrow }]) => ({
      date,
      amount: round2(commissions + borrow),
      commissions: round2(commissions),
      borrow: round2(borrow),
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Count data rows in the Cash Balance section (rows whose first column is a
 * date). Zero means the export omitted the section's activity entirely — the
 * caller warns rather than silently skipping fees/balances on re-import.
 */
export function countCashBalanceRows(csvText: string): number {
  const lines = csvText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  let inCashBalance = false;
  let headerFound = false;
  let count = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === 'Cash Balance') { inCashBalance = true; headerFound = false; continue; }
    if (inCashBalance && !headerFound && trimmed.includes('DATE') && trimmed.includes('TYPE')) {
      headerFound = true;
      continue;
    }
    if (inCashBalance && headerFound && CASH_BALANCE_END_HEADERS.some(h => trimmed.startsWith(h))) break;
    if (!inCashBalance || !headerFound) continue;

    const dateStr = splitCSVLine(line)[0]?.trim();
    if (dateStr && dateStr.includes('/')) count++;
  }

  return count;
}

function splitCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
}

function parseQuotedAmount(str: string): number {
  const cleaned = str.replace(/["$,]/g, '');
  return parseFloat(cleaned) || 0;
}

function parseTOSTradeActivity(csvText: string): TOSTrade[] {
  const lines = csvText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter(line => line.trim());
  const trades: TOSTrade[] = [];
  let inFilledOrders = false;
  let filledOrdersHeaderFound = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.includes('Filled Orders') && !line.includes('Exec Time')) {
      inFilledOrders = true;
      filledOrdersHeaderFound = false;
      continue;
    }
    if (line.includes('Canceled Orders') || line.includes('Working Orders') || line.includes('Rolling Strategies')) {
      inFilledOrders = false;
      continue;
    }
    if (inFilledOrders) {
      if (line.includes('Exec Time') && line.includes('Spread')) {
        filledOrdersHeaderFound = true;
        continue;
      }
      if (!filledOrdersHeaderFound) continue;

      const cleanLine = line.replace(/^,+,*/, '');
      const parts = cleanLine.split(',').map(p => p.trim());

      if (parts.length >= 8) {
        const execTime = parts[0];
        const side = parts[2] as 'BUY' | 'SELL';
        const qtyStr = parts[3];
        const posEffect = parts[4];
        const symbol = parts[5];
        const priceStr = parts[9];

        if (!execTime || !execTime.includes('/')) continue;
        if (!symbol || !side || !qtyStr) continue;

        const quantity = Math.abs(parseInt(qtyStr.replace(/[+,]/g, ''), 10) || 0);
        const price = parseFloat(priceStr) || 0;

        if (quantity > 0 && price > 0 && symbol && symbol !== 'Symbol') {
          const [datePart, timePart] = execTime.split(' ');
          if (!datePart || !timePart) continue;
          const [month, day, yearShort] = datePart.split('/');
          if (!month || !day || !yearShort) continue;
          const year = '20' + yearShort;
          const isoDate = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;

          trades.push({
            id: `${symbol}-${isoDate}-${timePart.replace(/:/g, '-')}-${Math.random().toString(36).substr(2, 9)}`,
            symbol, side, quantity, price,
            date: isoDate, time: timePart, execTime, posEffect,
            orderType: parts[13] || 'MKT'
          });
        }
      }
    }
  }
  return trades;
}

function parseTOSPositionStatement(csvText: string): TOSTrade[] {
  const lines = csvText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter(line => line.trim());
  const trades: TOSTrade[] = [];

  let statementDate = '';
  for (const line of lines) {
    const match = line.match(/Position Statement for.+on\s+(\d{1,2}\/\d{1,2}\/\d{2})/);
    if (match) {
      const [month, day, yearShort] = match[1].split('/');
      statementDate = `20${yearShort}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
      break;
    }
  }
  if (!statementDate) statementDate = getTodayInEST();

  let inDataSection = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.includes('Instrument') && trimmed.includes('P/L Day')) { inDataSection = true; continue; }
    if (trimmed.includes('Subtotals:') || trimmed.includes('Overall Totals:')) { inDataSection = false; continue; }

    if (inDataSection) {
      const parts = trimmed.split(',').map(p => p.trim());
      if (parts.length >= 8) {
        const symbol = parts[0];
        const qtyStr = parts[1];
        const plDayStr = parts[7];
        if (!symbol || symbol.includes(' ') || symbol === 'Instrument') continue;

        let pnl = 0;
        if (plDayStr) {
          const cleanPnL = plDayStr.replace('$', '').replace(/[()]/g, '').replace(/,/g, '');
          pnl = parseFloat(cleanPnL) || 0;
          if (plDayStr.includes('(') && plDayStr.includes(')')) pnl = -Math.abs(pnl);
        }
        const qty = parseInt(qtyStr, 10) || 0;

        if (pnl !== 0) {
          trades.push({
            id: `${symbol}-${statementDate}-${Math.random().toString(36).substr(2, 9)}`,
            symbol,
            side: pnl >= 0 ? 'SELL' : 'BUY',
            quantity: 1,
            price: Math.abs(pnl),
            date: statementDate,
            time: '16:00:00',
            execTime: `${statementDate} 16:00:00`,
            posEffect: qty === 0 ? 'CLOSED' : 'OPEN',
            orderType: 'POSITION_PNL',
            pnl
          });
        }
      }
    }
  }
  return trades;
}

function parseTOSStatement(csvText: string): TOSTrade[] {
  const lines = csvText.split('\n').filter(line => line.trim());
  const trades: TOSTrade[] = [];
  let inEquitiesSection = false;

  for (const line of lines) {
    if (line === 'Equities') { inEquitiesSection = true; continue; }
    if (line.includes('OVERALL TOTALS') || line.includes('Profits and Losses')) { inEquitiesSection = false; }

    if (inEquitiesSection) {
      if (line.includes('Symbol') && line.includes('Description')) continue;
      const parts = line.split(',').map(p => p.trim());
      if (parts.length >= 4 && parts[0] && !parts[0].includes('Symbol')) {
        const symbol = parts[0];
        const quantity = parseInt(parts[2], 10);
        const price = parseFloat(parts[3]);
        if (!isNaN(quantity) && !isNaN(price) && symbol !== 'Symbol') {
          trades.push({
            id: `${symbol}-${getTodayInEST()}-${Math.random().toString(36).substr(2, 9)}`,
            symbol,
            side: quantity > 0 ? 'BUY' : 'SELL',
            quantity: Math.abs(quantity),
            price,
            date: getTodayInEST(),
            time: getCurrentTimeInEST(),
            execTime: getNowInEST()
          });
        }
      }
    }
  }
  return trades;
}

export function calculateDailyPnL(trades: TOSTrade[]): DayData[] {
  const byDate: Record<string, TOSTrade[]> = {};
  trades.forEach(trade => {
    if (!byDate[trade.date]) byDate[trade.date] = [];
    byDate[trade.date].push(trade);
  });

  return Object.entries(byDate).map(([date, dayTrades]) => {
    const bySymbol: Record<string, TOSTrade[]> = {};
    dayTrades.forEach(trade => {
      if (!bySymbol[trade.symbol]) bySymbol[trade.symbol] = [];
      bySymbol[trade.symbol].push(trade);
    });

    let totalPnL = 0;
    let wins = 0;
    let losses = 0;

    Object.values(bySymbol).forEach(symbolTrades => {
      const buys = symbolTrades.filter(t => t.side === 'BUY');
      const sells = symbolTrades.filter(t => t.side === 'SELL');
      if (buys.length > 0 && sells.length > 0) {
        const buyValue = buys.reduce((sum, t) => sum + t.price * t.quantity, 0);
        const buyQty = buys.reduce((sum, t) => sum + t.quantity, 0);
        const avgBuy = buyQty > 0 ? buyValue / buyQty : 0;
        const sellValue = sells.reduce((sum, t) => sum + t.price * t.quantity, 0);
        const sellQty = sells.reduce((sum, t) => sum + t.quantity, 0);
        const avgSell = sellQty > 0 ? sellValue / sellQty : 0;
        const matchedQty = Math.min(buyQty, sellQty);
        const pnl = (avgSell - avgBuy) * matchedQty;
        totalPnL += pnl;
        if (pnl > 0) wins++;
        else if (pnl < 0) losses++;
      }
    });

    const totalTrades = wins + losses;
    return {
      date,
      pnl: totalPnL,
      trades: dayTrades.length,
      winRate: totalTrades > 0 ? Math.round((wins / totalTrades) * 100) : undefined,
      hasJournal: false
    };
  }).sort((a, b) => a.date.localeCompare(b.date));
}
