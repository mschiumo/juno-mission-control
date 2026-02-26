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
  const normalizedText = csvText.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  
  // Check if this is a "Position Statement" format (has P/L per position)
  if (normalizedText.includes('Position Statement for') && normalizedText.includes('P/L Day')) {
    return parseTOSPositionStatement(csvText);
  }
  
  // Check if this is a "Today's Trade Activity" format
  if (normalizedText.includes("Today's Trade Activity") || normalizedText.includes('Filled Orders')) {
    return parseTOSTradeActivity(csvText);
  }
  
  // Check if this is an Account Statement format with "Account Statement" header
  if (normalizedText.includes('Account Statement') || normalizedText.includes('Statement for')) {
    // Try trade activity format first
    const activityTrades = parseTOSTradeActivity(csvText);
    if (activityTrades.length > 0) {
      return activityTrades;
    }
    // Fall back to position statement format
    return parseTOSPositionStatement(csvText);
  }
  
  // Try to auto-detect format by looking for common patterns
  const lines = normalizedText.split('\n').filter(l => l.trim());
  
  // Check for trade activity patterns (filled orders section)
  if (lines.some(l => l.includes('Exec Time') && l.includes('Symbol'))) {
    return parseTOSTradeActivity(csvText);
  }
  
  // Check for position statement patterns
  if (lines.some(l => l.includes('Instrument') && l.includes('P/L Day'))) {
    return parseTOSPositionStatement(csvText);
  }
  
  // Otherwise use the original statement parser
  return parseTOSStatement(csvText);
}

function parseTOSTradeActivity(csvText: string): TOSTrade[] {
  // Normalize line endings and split
  const lines = csvText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter(line => line.trim());
  const trades: TOSTrade[] = [];
  let inFilledOrders = false;
  let filledOrdersHeaderFound = false;
  let headerColumns: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Enter Filled Orders section
    if (line.includes('Filled Orders') && !line.includes('Exec Time')) {
      inFilledOrders = true;
      filledOrdersHeaderFound = false;
      continue;
    }

    // Exit Filled Orders section
    if (line.includes('Canceled Orders') || line.includes('Working Orders') || line.includes('Rolling Strategies') || line.includes('Order Cancel Requests')) {
      inFilledOrders = false;
      continue;
    }

    if (inFilledOrders) {
      // Header row - parse columns
      if (line.includes('Exec Time') || line.includes('Spread') || line.includes('Side')) {
        // Remove leading empty fields and parse header
        const cleanLine = line.replace(/^,+,*/, '');
        headerColumns = cleanLine.split(',').map(p => p.trim().toLowerCase());
        filledOrdersHeaderFound = true;
        continue;
      }

      // Skip if we haven't found the header yet
      if (!filledOrdersHeaderFound) {
        continue;
      }

      // Parse filled order row
      // Remove leading empty fields (commas at start)
      const cleanLine = line.replace(/^,+,*/, '');
      const parts = cleanLine.split(',').map(p => p.trim());

      // Build column index map from header
      const colMap: Record<string, number> = {};
      headerColumns.forEach((col, idx) => {
        colMap[col] = idx;
      });

      // Extract values using column names for flexibility
      const execTime = parts[colMap['exec time'] ?? 0];
      const spread = parts[colMap['spread'] ?? 1];
      const side = (parts[colMap['side'] ?? 2] as 'BUY' | 'SELL');
      const qtyStr = parts[colMap['qty'] ?? colMap['quantity'] ?? 3];
      const posEffect = parts[colMap['pos effect'] ?? 4];
      const symbol = parts[colMap['symbol'] ?? 5];
      const exp = parts[colMap['exp'] ?? 6];
      const strike = parts[colMap['strike'] ?? 7];
      const type = parts[colMap['type'] ?? 8];
      const priceStr = parts[colMap['price'] ?? 9];
      const netPriceStr = parts[colMap['net price'] ?? 10];

      // Validate we have a real trade (not a header or empty)
      if (!execTime || !execTime.includes('/')) {
        continue;
      }

      // Skip if missing critical fields
      if (!symbol || !side || !qtyStr) {
        continue;
      }

      // Validate side
      if (side !== 'BUY' && side !== 'SELL') {
        continue;
      }

      const quantity = Math.abs(parseInt(qtyStr.replace(/[+,]/g, ''), 10) || 0);
      const price = parseFloat(priceStr) || parseFloat(netPriceStr) || 0;

      if (quantity > 0 && price > 0 && symbol && symbol !== 'Symbol') {
        // Parse date from exec time (2/19/26 10:01:46)
        const [datePart, timePart] = execTime.split(' ');
        if (!datePart || !timePart) continue;

        const [month, day, yearShort] = datePart.split('/');
        if (!month || !day || !yearShort) continue;

        // Handle 2-digit or 4-digit year
        const year = yearShort.length === 2 ? '20' + yearShort : yearShort;
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
          orderType: parts[colMap['order type'] ?? 13] || 'MKT'
        });
      }
    }
  }

  return trades;
}

function parseTOSPositionStatement(csvText: string): TOSTrade[] {
  const lines = csvText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter(line => line.trim());
  const trades: TOSTrade[] = [];
  
  // Extract date from header: "Position Statement for D-69512502 (ira) on 2/20/26 15:49:23"
  // Also handle "Account Statement for..." format
  let statementDate = '';
  for (const line of lines) {
    const match = line.match(/(?:Position|Account) Statement for.+on\s+(\d{1,2}\/\d{1,2}\/\d{2,4})/);
    if (match) {
      const [month, day, yearShort] = match[1].split('/');
      const year = yearShort.length === 2 ? '20' + yearShort : yearShort;
      statementDate = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
      break;
    }
  }
  
  // If no date found in header, use today in EST
  if (!statementDate) {
    statementDate = getTodayInEST();
  }
  
  let inDataSection = false;
  let headerColumns: string[] = [];
  
  for (const line of lines) {
    const trimmed = line.trim();
    
    // Find header row - look for Instrument and P/L Day columns
    if ((trimmed.includes('Instrument') || trimmed.includes('Symbol')) && trimmed.includes('P/L Day')) {
      inDataSection = true;
      headerColumns = trimmed.split(',').map(p => p.trim().toLowerCase());
      continue;
    }
    
    // Stop at subtotals/totals
    if (trimmed.includes('Subtotals:') || trimmed.includes('Overall Totals:') || trimmed.includes('Account Totals')) {
      inDataSection = false;
      continue;
    }
    
    if (inDataSection) {
      // Parse position row
      // Format: SYMBOL,Qty,Days,Trade Price,Mark,Mrk Chng,P/L Open,P/L Day,BP Effect
      // Example: INDI,0,,.00,3.555,+.125,$0.00,($5.00),$0.00
      
      const parts = trimmed.split(',').map(p => p.trim());
      
      // Build column index map
      const colMap: Record<string, number> = {};
      headerColumns.forEach((col, idx) => {
        colMap[col] = idx;
      });
      
      // Need at least symbol and P/L Day
      if (parts.length >= 2) {
        const symbolIdx = colMap['instrument'] ?? colMap['symbol'] ?? 0;
        const symbol = parts[symbolIdx];
        const qtyStr = parts[colMap['qty'] ?? colMap['quantity'] ?? 1];
        const plDayIdx = colMap['p/l day'] ?? colMap['pl day'] ?? 7;
        const plDayStr = parts[plDayIdx];
        
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
