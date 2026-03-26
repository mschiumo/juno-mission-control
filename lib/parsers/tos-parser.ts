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

export interface TOSAccountStatementResult {
  trades: TOSTrade[];
  positionAdjustments: RawPositionAdjustment[];
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
 * Parse a TOS Account Statement returning both trades and position adjustments.
 */
export function parseTOSAccountStatementFull(csvText: string): TOSAccountStatementResult {
  const trades = parseTOSAccountStatement(csvText);
  const positionAdjustments = parseCashBalanceAdjustments(csvText);
  return { trades, positionAdjustments };
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

    const [month, day, yearShort] = datePart.split('/');
    if (!month || !day || !yearShort) continue;

    const year = '20' + yearShort;
    const isoDate = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;

    trades.push({
      id: `${symbol}-${isoDate}-${timePart.replace(/:/g, '-')}-${Math.random().toString(36).substr(2, 9)}`,
      symbol, side, quantity, price,
      date: isoDate, time: timePart, execTime, posEffect, orderType
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

    const dateParts = dateStr.split('/');
    if (dateParts.length !== 3) continue;
    const [month, day, yearShort] = dateParts;
    const isoDate = `20${yearShort}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;

    const amount = parseQuotedAmount(amountStr);
    if (amount === 0) continue;

    adjustments.push({ date: isoDate, time: timeStr, amount: Math.abs(amount) });
  }
  return adjustments;
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
