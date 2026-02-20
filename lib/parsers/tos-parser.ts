export interface TOSTrade {
  id?: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  quantity: number;
  price: number;
  date: string; // ISO date YYYY-MM-DD
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

export function parseTOSCSV(csvText: string): TOSTrade[] {
  // Check if this is a "Today's Trade Activity" format
  if (csvText.includes("Today's Trade Activity") || csvText.includes('Filled Orders')) {
    return parseTOSTradeActivity(csvText);
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
          const today = new Date().toISOString().split('T')[0];
          
          trades.push({
            id: `${symbol}-${today}-${Math.random().toString(36).substr(2, 9)}`,
            symbol,
            side: quantity > 0 ? 'BUY' : 'SELL',
            quantity: Math.abs(quantity),
            price,
            date: today,
            time: new Date().toTimeString().split(' ')[0],
            execTime: new Date().toLocaleString()
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
