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

/**
 * Get current date in EST as YYYY-MM-DD
 */
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

/**
 * Get current time in EST as HH:MM:SS
 */
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

/**
 * Get current date/time in EST as ISO string with -05:00 offset
 */
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

export function parseTOSCSV(csvText: string): TOSTrade[] {
  // Check for Account Statement format (has individual execution history)
  if (csvText.includes('Account Statement for') && csvText.includes('Account Trade History')) {
    return parseTOSAccountStatement(csvText);
  }

  // Check if this is a "Position Statement" format (has P/L per position)
  if ((csvText.includes('Position Statement for') || csvText.includes('Account Statement')) && csvText.includes('P/L Day')) {
    return parseTOSPositionStatement(csvText);
  }

  // Check for generic "Statement for" format
  if (csvText.includes('Statement for') && csvText.includes('P/L Day')) {
    return parseTOSPositionStatement(csvText);
  }

  // Check if this is a "Today's Trade Activity" format
  if (csvText.includes("Today's Trade Activity") || csvText.includes('Filled Orders')) {
    return parseTOSTradeActivity(csvText);
  }

  // Otherwise use the original statement parser
  return parseTOSStatement(csvText);
}

function parseTOSAccountStatement(csvText: string): TOSTrade[] {
  const lines = csvText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter(line => line.trim());
  const trades: TOSTrade[] = [];

  let inTradeHistory = false;
  let headerFound = false;

  for (const line of lines) {
    const trimmed = line.trim();

    // Enter Account Trade History section
    if (trimmed === 'Account Trade History') {
      inTradeHistory = true;
      headerFound = false;
      continue;
    }

    if (!inTradeHistory) continue;

    // Header row: ,Exec Time,Spread,Side,Qty,Pos Effect,Symbol,...
    if (!headerFound) {
      if (trimmed.includes('Exec Time') && trimmed.includes('Spread')) {
        headerFound = true;
      }
      continue;
    }

    // Any line not starting with "," signals the end of this section
    if (!line.startsWith(',')) {
      inTradeHistory = false;
      continue;
    }

    // Data row: ,3/24/26 12:32:59,STOCK,SELL,-131,TO CLOSE,WRD,,,STOCK,7.52,7.52,MKT
    // Columns: [0]blank [1]ExecTime [2]Spread [3]Side [4]Qty [5]PosEffect [6]Symbol
    //          [7]Exp [8]Strike [9]Type [10]Price [11]NetPrice [12]OrderType
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

    // Parse "3/24/26 12:32:59"
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
      symbol,
      side,
      quantity,
      price,
      date: isoDate,
      time: timePart,
      execTime,
      posEffect,
      orderType
    });
  }

  return trades;
}

function parseTOSTradeActivity(csvText: string): TOSTrade[] {
  // Normalize line endings and split
  const lines = csvText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter(line => line.trim());
  const trades: TOSTrade[] = [];
  let inFilledOrders = false;
  let filledOrdersHeaderFound = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Enter Filled Orders section
    if (line.includes('Filled Orders') && !line.includes('Exec Time')) {
      inFilledOrders = true;
      filledOrdersHeaderFound = false;
      continue;
    }

    // Exit Filled Orders section
    if (line.includes('Canceled Orders') || line.includes('Working Orders') || line.includes('Rolling Strategies')) {
      inFilledOrders = false;
      continue;
    }

    if (inFilledOrders) {
      // Header row - skip (contains "Exec Time", "Spread", etc.)
      if (line.includes('Exec Time') && line.includes('Spread')) {
        filledOrdersHeaderFound = true;
        continue;
      }

      // Skip if we haven't found the header yet
      if (!filledOrdersHeaderFound) {
        continue;
      }

      // Parse filled order
      // Format: ,,2/19/26 10:01:46,STOCK,SELL,-300,TO CLOSE,BTG,,,STOCK,4.92,4.92,.00,LMT
      // Or:   ,,Exec Time,Spread,Side,Qty,Pos Effect,Symbol,Exp,Strike,Type,Price,Net Price,Price Improvement,Order Type

      // Remove leading empty fields (commas at start)
      const cleanLine = line.replace(/^,+,*/, '');
      const parts = cleanLine.split(',').map(p => p.trim());

      // Need at least: Exec Time, Spread, Side, Qty, Pos Effect, Symbol, Type, Price
      if (parts.length >= 8) {
        const execTime = parts[0];
        const spread = parts[1];
        const side = parts[2] as 'BUY' | 'SELL';
        const qtyStr = parts[3];
        const posEffect = parts[4];
        const symbol = parts[5];
        const type = parts[8]; // STOCK, etc.
        const priceStr = parts[9]; // Price column

        // Validate we have a real trade (not a header or empty)
        if (!execTime || !execTime.includes('/')) {
          continue;
        }

        // Skip if missing critical fields
        if (!symbol || !side || !qtyStr) {
          continue;
        }

        const quantity = Math.abs(parseInt(qtyStr.replace(/[+,]/g, ''), 10) || 0);
        const price = parseFloat(priceStr) || 0;

        if (quantity > 0 && price > 0 && symbol && symbol !== 'Symbol') {
          // Parse date from exec time (2/19/26 10:01:46)
          const [datePart, timePart] = execTime.split(' ');
          if (!datePart || !timePart) continue;

          const [month, day, yearShort] = datePart.split('/');
          if (!month || !day || !yearShort) continue;

          const year = '20' + yearShort;
          const isoDate = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;

          trades.push({
            id: `${symbol}-${isoDate}-${timePart.replace(/:/g, '-')}-${Math.random().toString(36).substr(2, 9)}`,
            symbol,
            side,
            quantity,
            price,
            date: isoDate,
            time: timePart,
            execTime,
            posEffect,
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
  
  // Extract date from header: "Position Statement for D-69512502 (ira) on 2/20/26 15:49:23"
  let statementDate = '';
  for (const line of lines) {
    const match = line.match(/Position Statement for.+on\s+(\d{1,2}\/\d{1,2}\/\d{2})/);
    if (match) {
      const [month, day, yearShort] = match[1].split('/');
      const year = '20' + yearShort;
      statementDate = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
      break;
    }
  }
  
  // If no date found in header, use today in EST
  if (!statementDate) {
    statementDate = getTodayInEST();
  }
  
  let inDataSection = false;
  
  for (const line of lines) {
    const trimmed = line.trim();
    
    // Find header row
    if (trimmed.includes('Instrument') && trimmed.includes('P/L Day')) {
      inDataSection = true;
      continue;
    }
    
    // Stop at subtotals/totals
    if (trimmed.includes('Subtotals:') || trimmed.includes('Overall Totals:')) {
      inDataSection = false;
      continue;
    }
    
    if (inDataSection) {
      // Parse position row
      // Format: SYMBOL,Qty,Days,Trade Price,Mark,Mrk Chng,P/L Open,P/L Day,BP Effect
      // Example: INDI,0,,.00,3.555,+.125,$0.00,($5.00),$0.00
      
      const parts = trimmed.split(',').map(p => p.trim());
      
      // Need at least symbol and P/L Day
      if (parts.length >= 8) {
        const symbol = parts[0];
        const qtyStr = parts[1];
        const plDayStr = parts[7];
        
        // Skip if no symbol or not a stock symbol (contains spaces = description line)
        if (!symbol || symbol.includes(' ') || symbol === 'Instrument') {
          continue;
        }
        
        // Parse P/L Day: format is "$62.00" or "($5.00)" for negative
        let pnl = 0;
        if (plDayStr) {
          const cleanPnL = plDayStr.replace('$', '').replace(/[()]/g, '').replace(/,/g, '');
          pnl = parseFloat(cleanPnL) || 0;
          // If wrapped in parentheses, it's negative
          if (plDayStr.includes('(') && plDayStr.includes(')')) {
            pnl = -Math.abs(pnl);
          }
        }
        
        // Only include if there's a PnL (position was closed today or had activity)
        // Qty=0 means position is closed
        const qty = parseInt(qtyStr, 10) || 0;
        
        if (pnl !== 0) {
          // Create a synthetic trade representing the day's PnL for this position
          trades.push({
            id: `${symbol}-${statementDate}-${Math.random().toString(36).substr(2, 9)}`,
            symbol,
            side: pnl >= 0 ? 'SELL' : 'BUY', // Winner = sell profit, Loser = buy loss
            quantity: 1, // Synthetic quantity for PnL tracking
            price: Math.abs(pnl), // Use PnL as price for display
            date: statementDate,
            time: '16:00:00', // Market close time
            execTime: `${statementDate} 16:00:00`,
            posEffect: qty === 0 ? 'CLOSED' : 'OPEN',
            orderType: 'POSITION_PNL',
            pnl: pnl // Store the actual PnL
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
    // Check for Equities section
    if (line === 'Equities') {
      inEquitiesSection = true;
      continue;
    }
    
    // Check for end of section
    if (line.includes('OVERALL TOTALS') || line.includes('Profits and Losses')) {
      inEquitiesSection = false;
    }
    
    if (inEquitiesSection) {
      // Header row
      if (line.includes('Symbol') && line.includes('Description')) {
        continue;
      }
      
      const parts = line.split(',').map(p => p.trim());
      
      // Need at least symbol, description, qty, trade price
      if (parts.length >= 4 && parts[0] && !parts[0].includes('Symbol')) {
        const symbol = parts[0];
        const qtyStr = parts[2];
        const priceStr = parts[3];
        
        const quantity = parseInt(qtyStr, 10);
        const price = parseFloat(priceStr);
        
        if (!isNaN(quantity) && !isNaN(price) && symbol !== 'Symbol') {
          const today = getTodayInEST();
          const currentTime = getCurrentTimeInEST();
          const nowEST = getNowInEST();
          
          trades.push({
            id: `${symbol}-${today}-${Math.random().toString(36).substr(2, 9)}`,
            symbol,
            side: quantity > 0 ? 'BUY' : 'SELL',
            quantity: Math.abs(quantity),
            price,
            date: today,
            time: currentTime,
            execTime: nowEST
          });
        }
      }
    }
  }
  
  return trades;
}

// ============================================================================
// Account Value Extraction from Position Statements
// ============================================================================

export interface PositionStatementAccountData {
  date: string; // YYYY-MM-DD
  totalPositionValue: number; // sum of Qty * Mark for all positions
  totalPLOpen: number; // sum of P/L Open
  totalPLDay: number; // sum of P/L Day
}

/** Parse a TOS dollar string like "$62.00" or "($5.00)" into a number. */
function parseDollarValue(str: string | undefined): number | null {
  if (!str) return null;
  const clean = str.replace('$', '').replace(/[()]/g, '').replace(/,/g, '').trim();
  const val = parseFloat(clean);
  if (isNaN(val)) return null;
  if (str.includes('(') && str.includes(')')) return -Math.abs(val);
  return val;
}

/**
 * Extract account-level data from a TOS Position Statement CSV.
 * Returns null if the CSV is not a position statement.
 */
export function extractAccountValueFromPositionStatement(
  csvText: string
): PositionStatementAccountData | null {
  const isPositionStatement =
    (csvText.includes('Position Statement for') ||
      csvText.includes('Account Statement')) &&
    csvText.includes('P/L Day');

  if (!isPositionStatement) return null;

  const lines = csvText
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .filter((line) => line.trim());

  // Extract date from header
  let statementDate = '';
  for (const line of lines) {
    const match = line.match(
      /(?:Position Statement|Account Statement|Statement) for.+on\s+(\d{1,2}\/\d{1,2}\/\d{2})/
    );
    if (match) {
      const [month, day, yearShort] = match[1].split('/');
      const year = '20' + yearShort;
      statementDate = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
      break;
    }
  }

  if (!statementDate) {
    statementDate = getTodayInEST();
  }

  let inDataSection = false;
  let totalPositionValue = 0;
  let totalPLOpen = 0;
  let totalPLDay = 0;

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed.includes('Instrument') && trimmed.includes('P/L Day')) {
      inDataSection = true;
      continue;
    }

    // Parse Overall Totals / Subtotals row for aggregate P/L
    if (trimmed.startsWith('Overall Totals:') || trimmed.startsWith('Subtotals:')) {
      const parts = trimmed.split(',').map((p) => p.trim());
      if (parts.length >= 8) {
        const plOpenStr = parts[6] || parts[parts.length - 3];
        const plDayStr = parts[7] || parts[parts.length - 2];
        const parsedPLOpen = parseDollarValue(plOpenStr);
        const parsedPLDay = parseDollarValue(plDayStr);
        if (parsedPLOpen !== null) totalPLOpen = parsedPLOpen;
        if (parsedPLDay !== null) totalPLDay = parsedPLDay;
      }
      inDataSection = false;
      continue;
    }

    if (!inDataSection) continue;

    // Data row: SYMBOL,Qty,Days,Trade Price,Mark,Mrk Chng,P/L Open,P/L Day,BP Effect
    const parts = trimmed.split(',').map((p) => p.trim());
    if (parts.length < 8) continue;

    const symbol = parts[0];
    if (!symbol || symbol.includes(' ') || symbol === 'Instrument') continue;

    const qty = parseInt(parts[1], 10) || 0;
    const mark = parseFloat(parts[4]) || 0;

    // Position value = shares held * current mark price
    if (qty !== 0 && mark > 0) {
      totalPositionValue += Math.abs(qty) * mark;
    }
  }

  return {
    date: statementDate,
    totalPositionValue: Math.round(totalPositionValue * 100) / 100,
    totalPLOpen: Math.round(totalPLOpen * 100) / 100,
    totalPLDay: Math.round(totalPLDay * 100) / 100,
  };
}

// Calculate daily PnL from trades
export function calculateDailyPnL(trades: TOSTrade[]): DayData[] {
  const byDate: Record<string, TOSTrade[]> = {};
  
  // Group trades by date
  trades.forEach(trade => {
    if (!byDate[trade.date]) byDate[trade.date] = [];
    byDate[trade.date].push(trade);
  });
  
  // Calculate PnL for each day
  return Object.entries(byDate).map(([date, dayTrades]) => {
    const bySymbol: Record<string, TOSTrade[]> = {};
    
    // Group by symbol for round-trip matching
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
