/**
 * ThinkOrSwim (TOS) CSV Parser
 * 
 * Handles paperMoney and TD Ameritrade account statement exports
 * Supports multiple sections: Cash, Futures, Forex, Crypto, Equities
 */

import type { Trade, TradeImportRow } from '@/types/trading';

export interface TOSTradeRow {
  symbol: string;
  description: string;
  qty: number;
  tradePrice: number;
  mark: number;
  closePrice?: number;
  tradeDate?: string;
  execTime?: string;
  side?: 'BUY' | 'SELL';
  orderId?: string;
  underlying?: string;
  exp?: string;
  strike?: string;
  putCall?: 'PUT' | 'CALL';
}

export interface TOSImportResult {
  success: boolean;
  imported: number;
  failed: number;
  errors: { row: number; message: string; data: Record<string, string> }[];
  trades: Trade[];
}

export interface ParsedTOSData {
  accountInfo: {
    accountId?: string;
    accountType?: string;
    generatedDate?: string;
  };
  sections: {
    cashTrades: TOSTradeRow[];
    futuresTrades: TOSTradeRow[];
    forexTrades: TOSTradeRow[];
    cryptoTrades: TOSTradeRow[];
    equitiesTrades: TOSTradeRow[];
  };
}

/**
 * Detect if CSV is in TOS format
 */
export function isTOSFormat(csv: string): boolean {
  const headerLines = csv.split('\n').slice(0, 10).join('\n').toLowerCase();
  
  // Look for TOS-specific markers
  const tosMarkers = [
    'td ameritrade',
    'papermoney',
    'account trade history',
    'account order history',
    'thinkorswim',
    'workingset',
    'executions',
  ];
  
  return tosMarkers.some(marker => 
    headerLines.includes(marker.toLowerCase())
  );
}

/**
 * Parse TOS CSV export
 */
export function parseTOSCSV(
  csv: string,
  userId: string
): TOSImportResult {
  const lines = csv.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  
  if (lines.length < 2) {
    return {
      success: false,
      imported: 0,
      failed: 0,
      errors: [{ row: 0, message: 'CSV must have at least a header and one data row', data: {} }],
      trades: [],
    };
  }

  const errors: { row: number; message: string; data: Record<string, string> }[] = [];
  const trades: Trade[] = [];
  const processedOrderIds = new Set<string>();
  
  // Extract account info from header
  const accountInfo = extractAccountInfo(lines);
  
  // Find and parse trade sections
  const tradeSections = findTradeSections(lines);
  
  // Parse each section
  for (const section of tradeSections) {
    try {
      const sectionTrades = parseTradeSection(section, userId, accountInfo.generatedDate, processedOrderIds);
      trades.push(...sectionTrades);
    } catch (error) {
      errors.push({
        row: section.startLine,
        message: error instanceof Error ? error.message : 'Error parsing section',
        data: { section: section.type },
      });
    }
  }
  
  // If no trades found in sections, try flat parsing
  if (trades.length === 0) {
    const flatTrades = parseFlatFormat(lines, userId, errors);
    trades.push(...flatTrades);
  }
  
  // Match buy/sell pairs for completed trades
  const matchedTrades = matchTradePairs(trades, userId);
  
  return {
    success: errors.length === 0,
    imported: matchedTrades.length,
    failed: errors.length,
    errors,
    trades: matchedTrades,
  };
}

/**
 * Extract account information from TOS header
 */
function extractAccountInfo(lines: string[]): { accountId?: string; accountType?: string; generatedDate?: string } {
  const info: { accountId?: string; accountType?: string; generatedDate?: string } = {};
  
  for (const line of lines.slice(0, 20)) {
    // Account ID pattern: "Account #123-456789"
    const accountMatch = line.match(/Account\s*#?\s*(\d+-?\d*)/i);
    if (accountMatch) {
      info.accountId = accountMatch[1];
    }
    
    // Account type pattern: "paperMoney" or "Live Trading"
    if (line.toLowerCase().includes('papermoney')) {
      info.accountType = 'paperMoney';
    } else if (line.toLowerCase().includes('live')) {
      info.accountType = 'Live';
    }
    
    // Generated date pattern: various formats
    const dateMatch = line.match(/(\d{1,2}\/\d{1,2}\/\d{2,4})/) || 
                      line.match(/(\d{4}-\d{2}-\d{2})/);
    if (dateMatch && !info.generatedDate) {
      info.generatedDate = dateMatch[1];
    }
  }
  
  return info;
}

interface TradeSection {
  type: string;
  startLine: number;
  endLine: number;
  headers: string[];
  rows: string[];
}

/**
 * Find all trade history sections in the CSV
 */
function findTradeSections(lines: string[]): TradeSection[] {
  const sections: TradeSection[] = [];
  const sectionHeaders = [
    { pattern: /Account Trade History/i, type: 'account_trade_history' },
    { pattern: /Executions/i, type: 'executions' },
    { pattern: /Today's Trade Activity/i, type: 'today_trades' },
    { pattern: /Futures/i, type: 'futures' },
    { pattern: /Forex/i, type: 'forex' },
    { pattern: /Crypto/i, type: 'crypto' },
  ];
  
  let currentSection: TradeSection | null = null;
  let headerRow: string[] | null = null;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Check for section header
    for (const sectionType of sectionHeaders) {
      if (sectionType.pattern.test(line)) {
        // Save previous section if exists
        if (currentSection && headerRow) {
          currentSection.headers = headerRow;
          sections.push(currentSection);
        }
        
        currentSection = {
          type: sectionType.type,
          startLine: i,
          endLine: i,
          headers: [],
          rows: [],
        };
        headerRow = null;
        break;
      }
    }
    
    // Look for column headers (Symbol, Description, Qty, etc.)
    if (currentSection && !headerRow) {
      const cols = parseCSVLine(line);
      if (cols.some(col => /symbol|description|qty|quantity/i.test(col))) {
        headerRow = cols.map(h => h.trim().toLowerCase());
        currentSection.startLine = i;
      }
    }
    
    // Collect data rows
    if (currentSection && headerRow && i > currentSection.startLine) {
      // Check for end of section (empty line, new section header, or totals)
      if (line.match(/^\s*$/i) || 
          line.match(/^(Total|Account|Positions|Working)/i) ||
          sectionHeaders.some(sh => sh.pattern.test(line) && i !== currentSection!.startLine)) {
        currentSection.endLine = i - 1;
        currentSection.headers = headerRow;
        sections.push(currentSection);
        currentSection = null;
        headerRow = null;
      } else {
        currentSection.rows.push(line);
      }
    }
  }
  
  // Don't forget the last section
  if (currentSection && headerRow) {
    currentSection.headers = headerRow;
    currentSection.endLine = lines.length - 1;
    sections.push(currentSection);
  }
  
  return sections;
}

/**
 * Parse a trade section into Trade objects
 */
function parseTradeSection(
  section: TradeSection,
  userId: string,
  defaultDate?: string,
  processedOrderIds?: Set<string>
): Trade[] {
  const trades: Trade[] = [];
  const headerMap = buildHeaderMap(section.headers);
  
  for (const row of section.rows) {
    const cols = parseCSVLine(row);
    if (cols.length < 3) continue;
    
    // Skip header rows or totals
    if (cols[0].toLowerCase().includes('symbol') || 
        cols[0].toLowerCase().includes('total') ||
        cols[0].match(/^\s*$/)) {
      continue;
    }
    
    try {
      const tosRow = parseTOSRow(cols, headerMap);
      if (!tosRow) continue;
      
      // Skip duplicate order IDs (partial fills handled separately)
      if (tosRow.orderId && processedOrderIds?.has(tosRow.orderId)) {
        continue;
      }
      if (tosRow.orderId) {
        processedOrderIds?.add(tosRow.orderId);
      }
      
      const trade = convertTOSRowToTrade(tosRow, userId, defaultDate);
      if (trade) {
        trades.push(trade);
      }
    } catch (error) {
      // Skip invalid rows
      continue;
    }
  }
  
  return trades;
}

/**
 * Build a map of column indices from headers
 */
function buildHeaderMap(headers: string[]): Map<string, number> {
  const map = new Map<string, number>();
  
  const columnMappings: [string[], string][] = [
    [['symbol', 'sym', 'ticker'], 'symbol'],
    [['description', 'desc', 'instrument'], 'description'],
    [['qty', 'quantity', 'shares', 'position'], 'qty'],
    [['trade price', 'price', 'fill price', 'exec price'], 'tradePrice'],
    [['mark', 'market', 'last'], 'mark'],
    [['close price', 'settlement', 'prev close'], 'closePrice'],
    [['time', 'exec time', 'execution time', 'filled time'], 'execTime'],
    [['date', 'exec date', 'trade date'], 'tradeDate'],
    [['side', 'buy/sell', 'action'], 'side'],
    [['order id', 'order #', 'ordernumber'], 'orderId'],
    [['underlying', 'underlier'], 'underlying'],
    [['exp', 'expiration', 'expiry'], 'exp'],
    [['strike'], 'strike'],
    [['put/call', 'type', 'option type'], 'putCall'],
  ];
  
  for (let i = 0; i < headers.length; i++) {
    const header = headers[i].toLowerCase().trim();
    
    for (const [patterns, key] of columnMappings) {
      if (patterns.some(p => header.includes(p))) {
        map.set(key, i);
        break;
      }
    }
  }
  
  return map;
}

/**
 * Parse a single TOS row
 */
function parseTOSRow(cols: string[], headerMap: Map<string, number>): TOSTradeRow | null {
  const getCol = (key: string): string => {
    const idx = headerMap.get(key);
    return idx !== undefined ? cols[idx]?.trim() || '' : '';
  };
  
  const symbol = getCol('symbol') || getCol('underlying');
  if (!symbol) return null;
  
  // Skip non-trade rows (headings, summaries, etc.)
  if (symbol.match(/^(Symbol|Total|Account|Working|Positions|Cash)/i)) {
    return null;
  }
  
  const qtyStr = getCol('qty');
  const qty = parseFloat(qtyStr.replace(/[,()]/g, ''));
  if (isNaN(qty) || qty === 0) return null;
  
  const priceStr = getCol('tradePrice') || getCol('mark') || getCol('closePrice');
  const tradePrice = parseFloat(priceStr.replace(/[$,]/g, ''));
  if (isNaN(tradePrice)) return null;
  
  return {
    symbol: symbol.toUpperCase(),
    description: getCol('description'),
    qty,
    tradePrice,
    mark: parseFloat(getCol('mark').replace(/[$,]/g, '')) || tradePrice,
    closePrice: parseFloat(getCol('closePrice').replace(/[$,]/g, '')) || undefined,
    tradeDate: getCol('tradeDate') || undefined,
    execTime: getCol('execTime') || undefined,
    side: detectSide(qty, getCol('side'), getCol('description')),
    orderId: getCol('orderId') || undefined,
    underlying: getCol('underlying') || undefined,
    exp: getCol('exp') || undefined,
    strike: getCol('strike') || undefined,
    putCall: getCol('putCall').toUpperCase() as 'PUT' | 'CALL' || undefined,
  };
}

/**
 * Detect trade side from quantity, side column, or description
 */
function detectSide(qty: number, sideCol: string, description: string): 'BUY' | 'SELL' {
  // Check explicit side column
  if (sideCol) {
    const side = sideCol.toUpperCase();
    if (side.includes('BUY')) return 'BUY';
    if (side.includes('SELL')) return 'SELL';
  }
  
  // Check description
  if (description) {
    const desc = description.toUpperCase();
    if (desc.includes('BOT') || desc.includes('BUY') || desc.includes('BOUGHT')) return 'BUY';
    if (desc.includes('SOLD') || desc.includes('SLL') || desc.includes('SELL')) return 'SELL';
  }
  
  // Default to quantity sign (positive = buy, negative = sell)
  return qty > 0 ? 'BUY' : 'SELL';
}

/**
 * Convert TOS row to Trade object
 */
function convertTOSRowToTrade(
  tosRow: TOSTradeRow,
  userId: string,
  defaultDate?: string
): Trade | null {
  const now = new Date().toISOString();
  
  // Build full symbol for options
  let symbol = tosRow.symbol;
  if (tosRow.exp && tosRow.strike) {
    const expDate = formatOptionDate(tosRow.exp);
    const optionType = tosRow.putCall || 'CALL';
    symbol = `${tosRow.underlying || tosRow.symbol} ${expDate} ${tosRow.strike} ${optionType}`;
  }
  
  // Parse date
  let entryTime = now;
  if (tosRow.tradeDate) {
    const parsed = parseTOSDate(tosRow.tradeDate);
    if (parsed) entryTime = parsed.toISOString();
  } else if (defaultDate) {
    const parsed = parseTOSDate(defaultDate);
    if (parsed) entryTime = parsed.toISOString();
  }
  
  // Build the trade
  const trade: Trade = {
    id: `trade_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    userId,
    symbol: symbol.toUpperCase(),
    side: tosRow.side === 'SELL' ? 'short' : 'long',
    entryPrice: Math.abs(tosRow.tradePrice),
    exitPrice: null,
    shares: Math.abs(tosRow.qty),
    entryTime,
    exitTime: null,
    pnl: null,
    fees: 0,
    netPnl: null,
    strategy: 'other',
    setupType: '',
    tags: tosRow.orderId ? [`order:${tosRow.orderId}`] : [],
    emotion: 'neutral',
    mistakes: '',
    notes: `Imported from TOS: ${tosRow.description || ''}`.trim(),
    screenshots: [],
    chartUrl: null,
    createdAt: now,
    updatedAt: now,
  };
  
  // Mark options trades
  if (tosRow.exp) {
    trade.tags.push('option');
  }
  
  return trade;
}

/**
 * Match buy/sell pairs to create completed trades
 */
function matchTradePairs(trades: Trade[], userId: string): Trade[] {
  const buyTrades: Trade[] = [];
  const sellTrades: Trade[] = [];
  const completedTrades: Trade[] = [];
  
  // Separate buys and sells
  for (const trade of trades) {
    if (trade.side === 'long') {
      buyTrades.push(trade);
    } else {
      sellTrades.push(trade);
    }
  }
  
  // Match buys with sells by symbol
  const symbolGroups = new Map<string, { buys: Trade[]; sells: Trade[] }>();
  
  for (const trade of trades) {
    const baseSymbol = trade.symbol.split(' ')[0]; // Remove option details
    if (!symbolGroups.has(baseSymbol)) {
      symbolGroups.set(baseSymbol, { buys: [], sells: [] });
    }
    const group = symbolGroups.get(baseSymbol)!;
    if (trade.side === 'long') {
      group.buys.push(trade);
    } else {
      group.sells.push(trade);
    }
  }
  
  // Process each symbol group
  for (const [symbol, group] of symbolGroups) {
    // Simple FIFO matching
    while (group.buys.length > 0 && group.sells.length > 0) {
      const buy = group.buys.shift()!;
      const sell = group.sells.shift()!;
      
      // Create completed trade
      const matchedTrade: Trade = {
        ...buy,
        id: `trade_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        exitTime: sell.entryTime,
        exitPrice: sell.entryPrice,
      };
      
      // Calculate P&L
      const priceDiff = matchedTrade.exitPrice! - matchedTrade.entryPrice;
      const pnl = priceDiff * matchedTrade.shares;
      const fees = 1 + (matchedTrade.shares * 0.01 * 2); // Estimate $1 + $0.01/share
      
      matchedTrade.pnl = pnl;
      matchedTrade.fees = fees;
      matchedTrade.netPnl = pnl - fees;
      
      completedTrades.push(matchedTrade);
    }
    
    // Add remaining open positions
    completedTrades.push(...group.buys);
    
    // Add remaining unmatched sells as short trades
    for (const sell of group.sells) {
      const shortTrade: Trade = {
        ...sell,
        id: `trade_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        side: 'short',
      };
      completedTrades.push(shortTrade);
    }
  }
  
  return completedTrades;
}

/**
 * Parse flat format (no sections, just rows)
 */
function parseFlatFormat(
  lines: string[],
  userId: string,
  errors: { row: number; message: string; data: Record<string, string> }[]
): Trade[] {
  const trades: Trade[] = [];
  
  // Find header row
  let headerIdx = -1;
  let headers: string[] = [];
  
  for (let i = 0; i < Math.min(lines.length, 30); i++) {
    const line = lines[i].toLowerCase();
    if (line.includes('symbol') && (line.includes('qty') || line.includes('quantity'))) {
      headerIdx = i;
      headers = parseCSVLine(lines[i]);
      break;
    }
  }
  
  if (headerIdx === -1) return trades;
  
  const headerMap = buildHeaderMap(headers);
  
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.match(/^\s*$/i) || line.match(/^(Total|Account)/i)) continue;
    
    try {
      const cols = parseCSVLine(line);
      const tosRow = parseTOSRow(cols, headerMap);
      if (tosRow) {
        const trade = convertTOSRowToTrade(tosRow, userId);
        if (trade) trades.push(trade);
      }
    } catch (error) {
      errors.push({
        row: i + 1,
        message: error instanceof Error ? error.message : 'Parse error',
        data: { line },
      });
    }
  }
  
  return trades;
}

/**
 * Parse CSV line respecting quoted fields
 */
function parseCSVLine(line: string, delimiter: string = ','): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];
    
    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        current += '"';
        i++; // Skip next quote
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === delimiter && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  
  result.push(current.trim());
  return result;
}

/**
 * Parse TOS date format
 */
function parseTOSDate(dateStr: string): Date | null {
  // Try various formats
  const formats = [
    // MM/DD/YYYY
    { regex: /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/, order: [1, 2, 3] },
    // MM/DD/YY
    { regex: /^(\d{1,2})\/(\d{1,2})\/(\d{2})$/, order: [1, 2, 3] },
    // YYYY-MM-DD
    { regex: /^(\d{4})-(\d{2})-(\d{2})$/, order: [1, 2, 3] },
    // DD-MMM-YY (e.g., 15-JAN-24)
    { regex: /^(\d{1,2})-([A-Z]{3})-(\d{2,4})$/i, order: [1, 2, 3], monthNames: true },
  ];
  
  for (const format of formats) {
    const match = dateStr.match(format.regex);
    if (match) {
      let year = parseInt(match[format.order[2]]);
      let month: number;
      let day = parseInt(match[format.order[0]]);
      
      if (format.monthNames) {
        const monthNames = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
        month = monthNames.indexOf(match[format.order[1]].toLowerCase());
        if (month === -1) continue;
      } else {
        month = parseInt(match[format.order[1]]) - 1;
      }
      
      // Handle 2-digit years
      if (year < 100) {
        year += year >= 50 ? 1900 : 2000;
      }
      
      const date = new Date(year, month, day);
      if (!isNaN(date.getTime())) {
        return date;
      }
    }
  }
  
  // Fallback to native Date parsing
  const date = new Date(dateStr);
  return isNaN(date.getTime()) ? null : date;
}

/**
 * Format option expiration date
 */
function formatOptionDate(expStr: string): string {
  const date = parseTOSDate(expStr);
  if (!date) return expStr;
  
  // Format as MMDDYY
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  const year = date.getFullYear().toString().slice(-2);
  
  return `${month}${day}${year}`;
}

/**
 * Get TOS format info for UI display
 */
export function getTOSFormatInfo(): {
  name: string;
  description: string;
  instructions: string[];
} {
  return {
    name: 'ThinkOrSwim (TOS)',
    description: 'TD Ameritrade / Schwab ThinkOrSwim platform exports',
    instructions: [
      'Open ThinkOrSwim and go to the Monitor tab',
      'Click "Account Statement" or "Trade History"',
      'Select your date range',
      'Click the export button (usually a download icon)',
      'Save as CSV format',
      'Upload the file here',
      'Works with both paperMoney and Live accounts',
    ],
  };
}