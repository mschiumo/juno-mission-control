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
  const lines = csvText.split('\n').filter(line => line.trim());
  const trades: TOSTrade[] = [];
  let inFilledOrders = false;
  
  for (const line of lines) {
    // Enter Filled Orders section
    if (line === 'Filled Orders') {
      inFilledOrders = true;
      continue;
    }
    
    // Exit Filled Orders section
    if (line === 'Canceled Orders' || line === 'Working Orders') {
      inFilledOrders = false;
      continue;
    }
    
    if (inFilledOrders) {
      // Header row - skip
      if (line.includes('Exec Time') && line.includes('Spread')) {
        continue;
      }
      
      const parts = line.split(',').map(p => p.trim());
      
      // Filled order format: ,,Exec Time,Spread,Side,Qty,Pos Effect,Symbol,Exp,Strike,Type,Price,Net Price,Price Improvement,Order Type
      if (parts.length >= 12 && parts[2] && parts[2].includes('/')) {
        const execTime = parts[2];
        const side = parts[4] as 'BUY' | 'SELL';
        const qtyStr = parts[5];
        const posEffect = parts[6];
        const symbol = parts[7];
        const priceStr = parts[11];
        const orderType = parts[13];
        
        const quantity = parseInt(qtyStr, 10);
        const price = parseFloat(priceStr);
        
        if (!isNaN(quantity) && !isNaN(price) && symbol) {
          // Parse date from exec time (2/19/26 10:01:46)
          const [datePart, timePart] = execTime.split(' ');
          const [month, day, yearShort] = datePart.split('/');
          const year = '20' + yearShort;
          const isoDate = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
          
          trades.push({
            id: `${symbol}-${isoDate}-${timePart}-${Math.random().toString(36).substr(2, 9)}`,
            symbol,
            side,
            quantity: Math.abs(quantity),
            price,
            date: isoDate,
            time: timePart,
            execTime,
            posEffect,
            orderType
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
