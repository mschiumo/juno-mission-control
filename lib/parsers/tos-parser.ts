export interface TOSTrade {
  symbol: string;
  side: 'BUY' | 'SELL';
  quantity: number;
  price: number;
  date: string;
  time: string;
  description?: string;
}

export function parseTOSCSV(csvText: string): TOSTrade[] {
  const lines = csvText.split('\n').filter(line => line.trim());
  const trades: TOSTrade[] = [];
  
  // Skip header rows and find data
  let dataStarted = false;
  
  for (const line of lines) {
    // TOS exports have headers, look for data rows
    if (!dataStarted) {
      if (line.includes('Symbol') || line.includes('DESCRIPTION')) {
        dataStarted = true;
        continue;
      }
    }
    
    const parts = line.split(',').map(p => p.trim());
    if (parts.length < 6) continue;
    
    // Try to identify trade rows
    const symbol = parts[0];
    const desc = parts[1] || '';
    const qtyStr = parts[2];
    const priceStr = parts[3];
    const dateStr = parts[4];
    const timeStr = parts[5];
    
    // Skip non-trade rows
    if (!symbol || symbol === 'Symbol') continue;
    
    const quantity = parseInt(qtyStr, 10);
    const price = parseFloat(priceStr);
    
    if (isNaN(quantity) || isNaN(price)) continue;
    
    // Determine side from description or quantity sign
    let side: 'BUY' | 'SELL' = quantity > 0 ? 'BUY' : 'SELL';
    
    if (desc.toLowerCase().includes('sold') || desc.toLowerCase().includes('sell')) {
      side = 'SELL';
    } else if (desc.toLowerCase().includes('bought') || desc.toLowerCase().includes('buy')) {
      side = 'BUY';
    }
    
    trades.push({
      symbol: symbol.replace(/"/g, ''),
      side,
      quantity: Math.abs(quantity),
      price,
      date: dateStr.replace(/"/g, ''),
      time: timeStr.replace(/"/g, ''),
      description: desc.replace(/"/g, '')
    });
  }
  
  return trades;
}
