/**
 * Flexible CSV Trade Parser
 * 
 * Auto-detects and parses multiple CSV formats:
 * 1. Standard Trade Format (user's working format)
 * 2. ThinkOrSwim (TOS) Trade Activity
 * 3. Schwab Account Statement (Position Statement)
 * 4. Generic CSV with auto-column mapping
 */

import { TOSTrade, parseTOSCSV, parseTOSAccountStatementFull, RawPositionAdjustment } from './tos-parser';
import { Trade, TradeSide, TradeStatus, Strategy, CSVImportResult, CSVImportError } from '@/types/trading';
import { getNowInEST } from '@/lib/date-utils';

export type CSVFormat = 'standard' | 'tos' | 'schwab' | 'generic';

export interface ParsedTrade {
  symbol: string;
  side: TradeSide;
  entryDate: string; // YYYY-MM-DD
  entryTime?: string; // HH:MM
  entryPrice: number;
  exitDate?: string; // YYYY-MM-DD
  exitTime?: string; // HH:MM
  exitPrice?: number;
  shares: number;
  fees?: number;
  strategy?: string;
  setupType?: string;
  tags?: string[];
  emotion?: string;
  notes?: string;
}

export interface FlexibleCSVOptions {
  userId: string;
  delimiter?: string;
  dateFormat?: string;
  defaultStrategy?: Strategy;
}

/**
 * Auto-detect CSV format and parse trades
 */
export function parseFlexibleCSV(csvText: string, options: FlexibleCSVOptions): CSVImportResult {
  const format = detectCSVFormat(csvText);
  
  switch (format) {
    case 'standard':
      return parseStandardFormat(csvText, options);
    case 'tos':
    case 'schwab':
      return parseTOSOrSchwabFormat(csvText, options);
    case 'generic':
    default:
      return parseGenericFormat(csvText, options);
  }
}

/**
 * Detect the format of the CSV file
 */
export function detectCSVFormat(csvText: string): CSVFormat {
  const headerLine = csvText.split('\n')[0]?.toLowerCase() || '';
  
  // Check for Standard format (user's format)
  // Has columns: Date, Symbol, Side, Entry_Price, Exit_Price, Shares, Entry_Time, Exit_Time
  if (headerLine.includes('entry_price') && headerLine.includes('exit_price') && 
      headerLine.includes('symbol') && headerLine.includes('side')) {
    return 'standard';
  }
  
  // Check for TOS/Schwab formats
  if (csvText.includes("Today's Trade Activity") || 
      csvText.includes('Filled Orders') || 
      csvText.includes('TO OPEN') || 
      csvText.includes('Position Statement for') ||
      csvText.includes('Account Statement') ||
      csvText.includes('Statement for') ||
      (csvText.includes('Exec Time') && csvText.includes('Spread'))) {
    return 'tos';
  }
  
  return 'generic';
}

/**
 * Parse the Standard Trade Format
 * Expected columns: Date, Symbol, Side, Entry_Price, Exit_Price, Shares, Entry_Time, Exit_Time, Fees, Strategy, Setup_Type, Tags, Emotion, Notes
 */
function parseStandardFormat(csvText: string, options: FlexibleCSVOptions): CSVImportResult {
  const lines = csvText.split('\n').filter(line => line.trim());
  const errors: CSVImportError[] = [];
  const trades: Trade[] = [];
  
  if (lines.length < 2) {
    return {
      success: false,
      imported: 0,
      failed: 0,
      errors: [{ row: 0, message: 'CSV must have at least a header and one data row', data: {} }],
      trades: [],
    };
  }
  
  const delimiter = options.delimiter || ',';
  const headers = parseCSVLine(lines[0], delimiter).map(h => h.trim().toLowerCase());
  
  // Build column index mapping
  const colMap: Record<string, number> = {
    date: headers.indexOf('date'),
    symbol: headers.indexOf('symbol'),
    side: headers.indexOf('side'),
    entryPrice: headers.indexOf('entry_price'),
    exitPrice: headers.indexOf('exit_price'),
    shares: headers.indexOf('shares'),
    entryTime: headers.indexOf('entry_time'),
    exitTime: headers.indexOf('exit_time'),
    fees: headers.indexOf('fees'),
    strategy: headers.indexOf('strategy'),
    setupType: headers.indexOf('setup_type'),
    tags: headers.indexOf('tags'),
    emotion: headers.indexOf('emotion'),
    notes: headers.indexOf('notes'),
  };
  
  // Parse data rows
  for (let i = 1; i < lines.length; i++) {
    const row = parseCSVLine(lines[i], delimiter);
    const rowData: Record<string, string> = {};
    headers.forEach((header, idx) => {
      rowData[header] = row[idx] || '';
    });
    
    try {
      const parsedTrade = parseStandardRow(row, colMap, options);
      if (parsedTrade) {
        trades.push(parsedTrade);
      }
    } catch (error) {
      errors.push({
        row: i + 1,
        message: error instanceof Error ? error.message : 'Unknown error',
        data: rowData,
      });
    }
  }
  
  return {
    success: errors.length === 0,
    imported: trades.length,
    failed: errors.length,
    errors,
    trades,
  };
}

/**
 * Parse a single row from Standard format
 */
function parseStandardRow(
  row: string[],
  colMap: Record<string, number>,
  options: FlexibleCSVOptions
): Trade | null {
  const now = getNowInEST();
  
  // Extract values
  const dateStr = colMap.date >= 0 ? row[colMap.date]?.trim() : '';
  const symbol = colMap.symbol >= 0 ? row[colMap.symbol]?.trim().toUpperCase() : '';
  const sideStr = colMap.side >= 0 ? row[colMap.side]?.trim().toLowerCase() : '';
  const entryPriceStr = colMap.entryPrice >= 0 ? row[colMap.entryPrice]?.trim() : '';
  const exitPriceStr = colMap.exitPrice >= 0 ? row[colMap.exitPrice]?.trim() : '';
  const sharesStr = colMap.shares >= 0 ? row[colMap.shares]?.trim() : '';
  const entryTimeStr = colMap.entryTime >= 0 ? row[colMap.entryTime]?.trim() : '';
  const exitTimeStr = colMap.exitTime >= 0 ? row[colMap.exitTime]?.trim() : '';
  const feesStr = colMap.fees >= 0 ? row[colMap.fees]?.trim() : '';
  const strategyStr = colMap.strategy >= 0 ? row[colMap.strategy]?.trim() : '';
  const setupType = colMap.setupType >= 0 ? row[colMap.setupType]?.trim() : '';
  const tagsStr = colMap.tags >= 0 ? row[colMap.tags]?.trim() : '';
  const emotionStr = colMap.emotion >= 0 ? row[colMap.emotion]?.trim() : '';
  const notes = colMap.notes >= 0 ? row[colMap.notes]?.trim() : '';
  
  // Validate required fields
  if (!symbol) {
    throw new Error('Symbol is required');
  }
  if (!entryPriceStr) {
    throw new Error('Entry price is required');
  }
  if (!sharesStr) {
    throw new Error('Shares is required');
  }
  
  // Parse side
  let side: TradeSide = TradeSide.LONG;
  if (sideStr.includes('short') || sideStr === 'sell' || sideStr === 's') {
    side = TradeSide.SHORT;
  }
  
  // Parse prices
  const entryPrice = parseFloat(entryPriceStr);
  if (isNaN(entryPrice) || entryPrice <= 0) {
    throw new Error(`Invalid entry price: ${entryPriceStr}`);
  }
  
  const shares = parseFloat(sharesStr);
  if (isNaN(shares) || shares <= 0) {
    throw new Error(`Invalid shares: ${sharesStr}`);
  }
  
  // Parse dates
  const { entryDate, exitDate } = parseTradeDates(dateStr, entryTimeStr, exitTimeStr);
  
  // Parse exit price if present
  let exitPrice: number | undefined;
  let status = TradeStatus.OPEN;
  let netPnL: number | undefined;
  let grossPnL: number | undefined;
  let returnPercent: number | undefined;
  
  if (exitPriceStr) {
    exitPrice = parseFloat(exitPriceStr);
    if (!isNaN(exitPrice) && exitPrice > 0) {
      status = TradeStatus.CLOSED;
      
      // Calculate P&L
      const priceDiff = side === TradeSide.LONG
        ? exitPrice - entryPrice
        : entryPrice - exitPrice;
      grossPnL = priceDiff * shares;
      
      // Parse fees
      const fees = feesStr ? parseFloat(feesStr) : 0;
      netPnL = grossPnL - (isNaN(fees) ? 0 : fees);
      returnPercent = (priceDiff / entryPrice) * 100;
    }
  }
  
  // Parse tags
  const tags = tagsStr ? tagsStr.split(',').map(t => t.trim()).filter(Boolean) : [];
  
  // Map strategy
  let strategy = options.defaultStrategy || Strategy.OTHER;
  if (strategyStr) {
    const normalizedStrategy = strategyStr.toUpperCase().replace(/\s+/g, '_');
    if (Object.values(Strategy).includes(normalizedStrategy as Strategy)) {
      strategy = normalizedStrategy as Strategy;
    }
  }
  
  const trade: Trade = {
    id: crypto.randomUUID(),
    userId: options.userId,
    symbol,
    side,
    status,
    strategy,
    entryDate,
    entryPrice,
    shares,
    exitDate: status === TradeStatus.CLOSED ? exitDate : undefined,
    exitPrice,
    grossPnL,
    netPnL,
    returnPercent,
    tags: tags.length > 0 ? tags : undefined,
    entryNotes: notes || undefined,
    createdAt: now,
    updatedAt: now,
  };
  
  // Add optional metadata notes
  const metadataParts: string[] = [];
  if (setupType) metadataParts.push(`Setup: ${setupType}`);
  if (emotionStr) metadataParts.push(`Emotion: ${emotionStr}`);
  
  if (metadataParts.length > 0) {
    trade.entryNotes = [trade.entryNotes, metadataParts.join(', ')].filter(Boolean).join(' | ');
  }
  
  return trade;
}

/**
 * Parse TOS or Schwab format using existing parser
 */
function parseTOSOrSchwabFormat(csvText: string, options: FlexibleCSVOptions): CSVImportResult {
  const isAccountStatement = csvText.includes('Account Statement for') && csvText.includes('Account Trade History');

  let tosTrades: TOSTrade[];
  let rawAdjustments: RawPositionAdjustment[] = [];

  if (isAccountStatement) {
    const result = parseTOSAccountStatementFull(csvText);
    tosTrades = result.trades;
    rawAdjustments = result.positionAdjustments;
  } else {
    tosTrades = parseTOSCSV(csvText);
  }

  if (tosTrades.length === 0 && rawAdjustments.length === 0) {
    return {
      success: false,
      imported: 0,
      failed: 0,
      errors: [{ row: 0, message: 'No trades found in file', data: {} }],
      trades: [],
    };
  }

  const trades: Trade[] = [];
  const now = getNowInEST();
  const isPositionStatement = csvText.includes('Position Statement for');

  if (isPositionStatement) {
    tosTrades.forEach(t => {
      const [year, month, day] = t.date.split('-');
      const [hours, minutes, seconds] = t.time.split(':');
      const entryDate = `${year}-${month}-${day}T${hours}:${minutes}:${seconds}-05:00`;

      trades.push({
        id: crypto.randomUUID(),
        userId: options.userId,
        symbol: t.symbol,
        side: t.pnl && t.pnl >= 0 ? TradeSide.LONG : TradeSide.SHORT,
        status: TradeStatus.CLOSED,
        strategy: Strategy.DAY_TRADE,
        entryDate,
        entryPrice: Math.abs(t.pnl || 0),
        exitDate: entryDate,
        exitPrice: 0,
        shares: 1,
        netPnL: t.pnl || 0,
        createdAt: now,
        updatedAt: now,
        entryNotes: `Imported from Position Statement - ${t.posEffect}`,
      });
    });
  } else {
    // Group by symbol+date
    const bySymbolDate: Record<string, typeof tosTrades> = {};
    tosTrades.forEach(t => {
      const key = `${t.symbol}::${t.date}`;
      if (!bySymbolDate[key]) bySymbolDate[key] = [];
      bySymbolDate[key].push(t);
    });

    // Track which adjustments have been claimed
    const claimedAdjs = new Set<number>();

    Object.entries(bySymbolDate).forEach(([key, symbolTrades]) => {
      const symbol = key.split('::')[0];
      const tradeDate = key.split('::')[1];

      const buys = symbolTrades.filter(t => t.side === 'BUY').sort((a, b) =>
        new Date(a.date + 'T' + a.time).getTime() - new Date(b.date + 'T' + b.time).getTime()
      );
      const sells = symbolTrades.filter(t => t.side === 'SELL').sort((a, b) =>
        new Date(a.date + 'T' + a.time).getTime() - new Date(b.date + 'T' + b.time).getTime()
      );

      // Pair round trips
      const minPairs = Math.min(buys.length, sells.length);
      for (let i = 0; i < minPairs; i++) {
        const buy = buys[i];
        const sell = sells[i];
        const shares = Math.min(buy.quantity, sell.quantity);
        const netPnL = (sell.price - buy.price) * shares;

        const isShort = sell.posEffect === 'TO OPEN' && buy.posEffect === 'TO CLOSE';
        const entry = isShort ? sell : buy;
        const exit = isShort ? buy : sell;

        const [year, month, day] = entry.date.split('-');
        const [hours, minutes, seconds] = entry.time.split(':');
        const entryDate = `${year}-${month}-${day}T${hours}:${minutes}:${seconds}-05:00`;

        const [eYear, eMonth, eDay] = exit.date.split('-');
        const [eHours, eMinutes, eSeconds] = exit.time.split(':');
        const exitDate = `${eYear}-${eMonth}-${eDay}T${eHours}:${eMinutes}:${eSeconds}-05:00`;

        trades.push({
          id: crypto.randomUUID(),
          userId: options.userId,
          symbol,
          side: isShort ? TradeSide.SHORT : TradeSide.LONG,
          status: TradeStatus.CLOSED,
          strategy: Strategy.DAY_TRADE,
          entryDate,
          entryPrice: entry.price,
          exitDate,
          exitPrice: exit.price,
          shares,
          netPnL: isShort ? (entry.price - exit.price) * shares : netPnL,
          createdAt: now,
          updatedAt: now,
          entryNotes: `Imported from TOS - ${isShort ? 'Short' : 'Long'} round trip`,
        });
      }

      const unmatchedBuys = buys.slice(minPairs);
      const unmatchedSells = sells.slice(minPairs);
      const stillUnmatched: TOSTrade[] = [];

      // Resolve unmatched BUY TO CLOSE via position adjustments (short covers)
      for (const buy of unmatchedBuys) {
        if (buy.posEffect === 'TO CLOSE') {
          // Find the best matching position adjustment: closest derived price to cover price
          let adjIdx = -1;
          let bestDiff = Infinity;
          rawAdjustments.forEach((a, idx) => {
            if (claimedAdjs.has(idx) || a.date !== tradeDate) return;
            const derivedPrice = a.amount / buy.quantity;
            if (derivedPrice <= 0) return;
            const diff = Math.abs(derivedPrice - buy.price) / buy.price;
            if (diff < bestDiff && diff < 0.5) {
              bestDiff = diff;
              adjIdx = idx;
            }
          });

          if (adjIdx !== -1) {
            const adj = rawAdjustments[adjIdx];
            claimedAdjs.add(adjIdx);
            const derivedEntry = Math.round((adj.amount / buy.quantity) * 100) / 100;
            const shortPnL = Math.round((derivedEntry - buy.price) * buy.quantity * 100) / 100;

            const entryDate = `${adj.date}T${adj.time}-05:00`;
            const [bY, bM, bD] = buy.date.split('-');
            const [bH, bMi, bS] = buy.time.split(':');
            const exitDate = `${bY}-${bM}-${bD}T${bH}:${bMi}:${bS}-05:00`;

            trades.push({
              id: crypto.randomUUID(),
              userId: options.userId,
              symbol,
              side: TradeSide.SHORT,
              status: TradeStatus.CLOSED,
              strategy: Strategy.DAY_TRADE,
              entryDate,
              entryPrice: derivedEntry,
              exitDate,
              exitPrice: buy.price,
              shares: buy.quantity,
              netPnL: shortPnL,
              returnPercent: ((derivedEntry - buy.price) / derivedEntry) * 100,
              createdAt: now,
              updatedAt: now,
              entryNotes: `Short cover - entry derived from position adjustment ($${adj.amount.toFixed(2)} / ${buy.quantity} shares)`,
            });
            continue;
          }
        }
        stillUnmatched.push(buy);
      }

      // Resolve unmatched SELL TO CLOSE via position adjustments (long closes)
      for (const sell of unmatchedSells) {
        if (sell.posEffect === 'TO CLOSE') {
          let adjIdx = -1;
          let bestDiff = Infinity;
          rawAdjustments.forEach((a, idx) => {
            if (claimedAdjs.has(idx) || a.date !== tradeDate) return;
            const derivedPrice = a.amount / sell.quantity;
            if (derivedPrice <= 0) return;
            const diff = Math.abs(derivedPrice - sell.price) / sell.price;
            if (diff < bestDiff && diff < 0.5) {
              bestDiff = diff;
              adjIdx = idx;
            }
          });

          if (adjIdx !== -1) {
            const adj = rawAdjustments[adjIdx];
            claimedAdjs.add(adjIdx);
            const derivedEntry = Math.round((adj.amount / sell.quantity) * 100) / 100;
            const longPnL = Math.round((sell.price - derivedEntry) * sell.quantity * 100) / 100;

            const entryDate = `${adj.date}T${adj.time}-05:00`;
            const [sY, sM, sD] = sell.date.split('-');
            const [sH, sMi, sS] = sell.time.split(':');
            const exitDate = `${sY}-${sM}-${sD}T${sH}:${sMi}:${sS}-05:00`;

            trades.push({
              id: crypto.randomUUID(),
              userId: options.userId,
              symbol,
              side: TradeSide.LONG,
              status: TradeStatus.CLOSED,
              strategy: Strategy.DAY_TRADE,
              entryDate,
              entryPrice: derivedEntry,
              exitDate,
              exitPrice: sell.price,
              shares: sell.quantity,
              netPnL: longPnL,
              returnPercent: ((sell.price - derivedEntry) / derivedEntry) * 100,
              createdAt: now,
              updatedAt: now,
              entryNotes: `Long close - entry derived from position adjustment ($${adj.amount.toFixed(2)} / ${sell.quantity} shares)`,
            });
            continue;
          }
        }
        stillUnmatched.push(sell);
      }

      // Remaining truly unmatched orders
      stillUnmatched.forEach(t => {
        const [year, month, day] = t.date.split('-');
        const [hours, minutes, seconds] = t.time.split(':');
        const entryDate = `${year}-${month}-${day}T${hours}:${minutes}:${seconds}-05:00`;

        trades.push({
          id: crypto.randomUUID(),
          userId: options.userId,
          symbol,
          side: t.side === 'BUY' ? TradeSide.LONG : TradeSide.SHORT,
          status: TradeStatus.OPEN,
          strategy: Strategy.DAY_TRADE,
          entryDate,
          entryPrice: t.price,
          shares: t.quantity,
          createdAt: now,
          updatedAt: now,
          entryNotes: `Imported from TOS - ${t.posEffect} (unmatched)`,
        });
      });
    });
  }

  return {
    success: true,
    imported: trades.length,
    failed: 0,
    errors: [],
    trades,
  };
}

/**
 * Parse generic CSV format with auto-column detection
 */
function parseGenericFormat(csvText: string, options: FlexibleCSVOptions): CSVImportResult {
  const lines = csvText.split('\n').filter(line => line.trim());
  
  if (lines.length < 2) {
    return {
      success: false,
      imported: 0,
      failed: 0,
      errors: [{ row: 0, message: 'CSV must have at least a header and one data row', data: {} }],
      trades: [],
    };
  }
  
  const delimiter = options.delimiter || ',';
  const headers = parseCSVLine(lines[0], delimiter);
  
  // Auto-detect column mappings
  const colMap = autoDetectColumns(headers);
  
  const errors: CSVImportError[] = [];
  const trades: Trade[] = [];
  
  // Parse data rows
  for (let i = 1; i < lines.length; i++) {
    const row = parseCSVLine(lines[i], delimiter);
    const rowData: Record<string, string> = {};
    headers.forEach((header, idx) => {
      rowData[header] = row[idx] || '';
    });
    
    try {
      const trade = parseGenericRow(row, colMap, options);
      if (trade) {
        trades.push(trade);
      }
    } catch (error) {
      errors.push({
        row: i + 1,
        message: error instanceof Error ? error.message : 'Unknown error',
        data: rowData,
      });
    }
  }
  
  return {
    success: errors.length === 0,
    imported: trades.length,
    failed: errors.length,
    errors,
    trades,
  };
}

/**
 * Auto-detect column mappings from headers
 */
function autoDetectColumns(headers: string[]): Record<string, number> {
  const colMap: Record<string, number> = {};
  const normalizedHeaders = headers.map(h => h.toLowerCase().trim().replace(/[_\s]/g, ''));
  
  // Symbol detection
  colMap.symbol = normalizedHeaders.findIndex(h => 
    /symbol|ticker|stock|instrument|underlying/.test(h)
  );
  
  // Side detection
  colMap.side = normalizedHeaders.findIndex(h => 
    /side|type|direction|action|buy.?sell|transaction/.test(h)
  );
  
  // Date detection (various formats)
  colMap.date = normalizedHeaders.findIndex(h => 
    /^(date|entrydate|opendate|tradedate|date.?time)$/.test(h)
  );
  if (colMap.date === -1) {
    colMap.date = normalizedHeaders.findIndex(h => 
      /date/.test(h) && !/exit/.test(h) && !/close/.test(h)
    );
  }
  
  // Entry price detection
  colMap.entryPrice = normalizedHeaders.findIndex(h => 
    /entryprice|openprice|price|entry|avgprice|fillprice/.test(h)
  );
  
  // Exit price detection
  colMap.exitPrice = normalizedHeaders.findIndex(h => 
    /exitprice|closeprice|sellprice|exit/.test(h)
  );
  
  // Shares/quantity detection
  colMap.shares = normalizedHeaders.findIndex(h => 
    /shares|quantity|qty|size|units|amount/.test(h)
  );
  
  // Time detection
  colMap.time = normalizedHeaders.findIndex(h => 
    /time|entrytime|opentime/.test(h)
  );
  
  // Exit date detection
  colMap.exitDate = normalizedHeaders.findIndex(h => 
    /exitdate|closedate|selldate/.test(h)
  );
  
  // Exit time detection
  colMap.exitTime = normalizedHeaders.findIndex(h => 
    /exittime|closetime/.test(h)
  );
  
  // Fees detection
  colMap.fees = normalizedHeaders.findIndex(h => 
    /fees|commission|comm|cost/.test(h)
  );
  
  return colMap;
}

/**
 * Parse a generic row with auto-detected columns
 */
function parseGenericRow(
  row: string[],
  colMap: Record<string, number>,
  options: FlexibleCSVOptions
): Trade | null {
  const now = getNowInEST();
  
  // Required: symbol, entryPrice, shares
  const symbol = colMap.symbol >= 0 ? row[colMap.symbol]?.trim().toUpperCase() : '';
  const entryPriceStr = colMap.entryPrice >= 0 ? row[colMap.entryPrice]?.trim() : '';
  const sharesStr = colMap.shares >= 0 ? row[colMap.shares]?.trim() : '';
  
  if (!symbol) {
    throw new Error('Symbol not found - check CSV headers');
  }
  
  // Parse side
  let side = TradeSide.LONG;
  if (colMap.side >= 0) {
    const sideStr = row[colMap.side]?.trim().toLowerCase() || '';
    if (sideStr.includes('short') || sideStr.includes('sell') || sideStr === 's') {
      side = TradeSide.SHORT;
    }
  }
  
  // Parse entry price
  let entryPrice = 0;
  if (entryPriceStr) {
    entryPrice = parseFloat(entryPriceStr.replace(/[$,]/g, ''));
  }
  if (isNaN(entryPrice) || entryPrice <= 0) {
    throw new Error(`Invalid entry price: ${entryPriceStr}`);
  }
  
  // Parse shares
  let shares = 0;
  if (sharesStr) {
    shares = parseFloat(sharesStr.replace(/[,]/g, ''));
  }
  if (isNaN(shares) || shares <= 0) {
    throw new Error(`Invalid shares: ${sharesStr}`);
  }
  
  // Parse dates
  const dateStr = colMap.date >= 0 ? row[colMap.date]?.trim() : '';
  const timeStr = colMap.time >= 0 ? row[colMap.time]?.trim() : '';
  const exitDateStr = colMap.exitDate >= 0 ? row[colMap.exitDate]?.trim() : '';
  const exitTimeStr = colMap.exitTime >= 0 ? row[colMap.exitTime]?.trim() : '';
  
  const { entryDate, exitDate } = parseTradeDates(dateStr, timeStr, exitTimeStr, exitDateStr);
  
  // Parse exit price
  let exitPrice: number | undefined;
  let status = TradeStatus.OPEN;
  let netPnL: number | undefined;
  let grossPnL: number | undefined;
  
  if (colMap.exitPrice >= 0) {
    const exitPriceVal = row[colMap.exitPrice]?.trim();
    if (exitPriceVal) {
      exitPrice = parseFloat(exitPriceVal.replace(/[$,]/g, ''));
      if (!isNaN(exitPrice) && exitPrice > 0) {
        status = TradeStatus.CLOSED;
        
        // Calculate P&L
        const priceDiff = side === TradeSide.LONG
          ? exitPrice - entryPrice
          : entryPrice - exitPrice;
        grossPnL = priceDiff * shares;
        
        // Parse fees
        const feesStr = colMap.fees >= 0 ? row[colMap.fees]?.trim() : '';
        const fees = feesStr ? parseFloat(feesStr.replace(/[$,]/g, '')) : 0;
        netPnL = grossPnL - (isNaN(fees) ? 0 : fees);
      }
    }
  }
  
  return {
    id: crypto.randomUUID(),
    userId: options.userId,
    symbol,
    side,
    status,
    strategy: options.defaultStrategy || Strategy.OTHER,
    entryDate,
    entryPrice,
    shares,
    exitDate: status === TradeStatus.CLOSED ? exitDate : undefined,
    exitPrice,
    grossPnL,
    netPnL,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Parse dates and times into ISO format with EST timezone
 */
function parseTradeDates(
  dateStr: string,
  entryTimeStr?: string,
  exitTimeStr?: string,
  exitDateStr?: string
): { entryDate: string; exitDate?: string } {
  const now = new Date();
  
  // Parse entry date
  let entryDate: Date;
  if (dateStr) {
    entryDate = new Date(dateStr);
    if (isNaN(entryDate.getTime())) {
      // Try other formats
      const parts = dateStr.split(/[-\/]/);
      if (parts.length === 3) {
        // Try MM/DD/YY or YYYY-MM-DD
        const [p1, p2, p3] = parts;
        if (p3.length === 2) {
          // Assume MM/DD/YY or DD/MM/YY
          entryDate = new Date(`20${p3}-${p1.padStart(2, '0')}-${p2.padStart(2, '0')}`);
        } else {
          entryDate = new Date(dateStr);
        }
      }
    }
  } else {
    entryDate = now;
  }
  
  // Parse entry time
  let entryHours = 9; // Default 9:00 AM
  let entryMinutes = 30;
  let entrySeconds = 0;
  
  if (entryTimeStr) {
    const timeMatch = entryTimeStr.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?/i);
    if (timeMatch) {
      let [_, h, m, s, ampm] = timeMatch;
      entryHours = parseInt(h);
      entryMinutes = parseInt(m);
      entrySeconds = s ? parseInt(s) : 0;
      
      if (ampm?.toUpperCase() === 'PM' && entryHours < 12) {
        entryHours += 12;
      } else if (ampm?.toUpperCase() === 'AM' && entryHours === 12) {
        entryHours = 0;
      }
    }
  }
  
  entryDate.setHours(entryHours, entryMinutes, entrySeconds);
  
  // Format entry date in EST
  const entryISO = formatDateToESTISO(entryDate);
  
  // Parse exit date
  let exitISO: string | undefined;
  if (exitDateStr || exitTimeStr) {
    let exitDate = exitDateStr ? new Date(exitDateStr) : new Date(entryDate);
    if (isNaN(exitDate.getTime())) {
      exitDate = new Date(entryDate);
    }
    
    if (exitTimeStr) {
      const timeMatch = exitTimeStr.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?/i);
      if (timeMatch) {
        let [_, h, m, s, ampm] = timeMatch;
        let exitHours = parseInt(h);
        let exitMinutes = parseInt(m);
        let exitSeconds = s ? parseInt(s) : 0;
        
        if (ampm?.toUpperCase() === 'PM' && exitHours < 12) {
          exitHours += 12;
        } else if (ampm?.toUpperCase() === 'AM' && exitHours === 12) {
          exitHours = 0;
        }
        
        exitDate.setHours(exitHours, exitMinutes, exitSeconds);
      }
    } else {
      // Default exit time if not specified
      exitDate.setHours(16, 0, 0);
    }
    
    exitISO = formatDateToESTISO(exitDate);
  }
  
  return { entryDate: entryISO, exitDate: exitISO };
}

/**
 * Format a Date to ISO string with EST timezone offset
 */
function formatDateToESTISO(date: Date): string {
  const estDateStr = date.toLocaleString('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  
  const [datePart, timePart] = estDateStr.split(', ');
  const [month, day, year] = datePart.split('/');
  return `${year}-${month}-${day}T${timePart}-05:00`;
}

/**
 * Parse a CSV line respecting quotes
 */
function parseCSVLine(line: string, delimiter: string): string[] {
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
 * Validate CSV format before parsing
 */
export function validateCSVFormat(csvText: string): { valid: boolean; format: CSVFormat; message?: string } {
  const lines = csvText.split('\n').filter(line => line.trim());
  
  if (lines.length < 2) {
    return { valid: false, format: 'generic', message: 'CSV must have at least a header and one data row' };
  }
  
  const format = detectCSVFormat(csvText);
  
  if (format === 'generic') {
    // Check if we can detect required columns
    const headers = parseCSVLine(lines[0], ',').map(h => h.toLowerCase().trim());
    const hasSymbol = headers.some(h => /symbol|ticker|stock/.test(h));
    const hasPrice = headers.some(h => /price|entry/.test(h));
    const hasQuantity = headers.some(h => /shares|quantity|qty|size/.test(h));
    
    if (!hasSymbol) {
      return { valid: false, format, message: 'Could not detect Symbol column. Expected headers: Symbol, Ticker, or Stock' };
    }
    if (!hasPrice) {
      return { valid: false, format, message: 'Could not detect Price column. Expected headers: Price, Entry_Price, or Entry' };
    }
    if (!hasQuantity) {
      return { valid: false, format, message: 'Could not detect Quantity column. Expected headers: Shares, Quantity, Qty, or Size' };
    }
  }
  
  return { valid: true, format };
}

/**
 * Get sample data for a format
 */
export function getFormatSample(format: CSVFormat): string {
  switch (format) {
    case 'standard':
      return `Date,Symbol,Side,Entry_Price,Exit_Price,Shares,Entry_Time,Exit_Time,Fees,Strategy,Setup_Type,Tags,Emotion,Notes
2026-03-23,AAPL,long,150.00,155.00,100,09:30,10:45,2.50,DAY_TRADE,breakout,momentum,confident,Good entry`;
    
    case 'tos':
      return `Filled Orders
,,Exec Time,Spread,Side,Qty,Pos Effect,Symbol,Exp,Strike,Type,Price,Net Price,Order Type
,,3/23/26 09:30:00,STOCK,BUY,+100,TO OPEN,AAPL,,,STOCK,150.00,150.00,LMT
,,3/23/26 10:45:00,STOCK,SELL,-100,TO CLOSE,AAPL,,,STOCK,155.00,155.00,MKT`;
    
    default:
      return `symbol,side,entry_price,exit_price,shares
AAPL,long,150.00,155.00,100`;
  }
}
