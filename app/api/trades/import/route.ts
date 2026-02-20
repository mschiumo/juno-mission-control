/**
 * CSV Import API
 *
 * POST /api/trades/import - Import trades from CSV
 */

import { NextRequest, NextResponse } from 'next/server';
import type { Trade, CSVImportResult, CSVImportError, CreateTradeRequest } from '@/types/trading';
import { Strategy, TradeStatus, TradeSide } from '@/types/trading';
import { saveTrades } from '@/lib/db/trades-v2';
import { parseTOSCSV } from '@/lib/parsers/tos-parser';

/**
 * POST /api/trades/import
 *
 * Import trades from CSV data (JSON or FormData with file)
 *
 * Body (JSON):
 * - csv: string (CSV content)
 * - userId: string (required)
 * - mapping: CSVImportMapping (column mapping configuration)
 * - delimiter: string (default: ',')
 *
 * Body (FormData):
 * - file: File (CSV file)
 * - userId: string (default: 'default')
 */

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const contentType = request.headers.get('content-type') || '';
    let csv: string;
    let userId: string;

    if (contentType.includes('multipart/form-data')) {
      // Handle FormData (file upload)
      const formData = await request.formData();
      const file = formData.get('file') as File | null;
      userId = (formData.get('userId') as string) || 'default';

      if (!file) {
        return NextResponse.json(
          { success: false, error: 'File is required' },
          { status: 400 }
        );
      }

      // Read file content
      csv = await file.text();
    } else {
      // Handle JSON
      const body = await request.json();
      csv = body.csv;
      userId = body.userId || 'default';

      if (!csv) {
        return NextResponse.json(
          { success: false, error: 'CSV data is required' },
          { status: 400 }
        );
      }
    }

    // Check if this is a TOS format
    if (csv.includes("Today's Trade Activity") || csv.includes('Filled Orders') || csv.includes('TO OPEN') || csv.includes('Position Statement for')) {
      const tosTrades = parseTOSCSV(csv);

      if (tosTrades.length === 0) {
        return NextResponse.json(
          { success: false, error: 'No trades found in TOS file. Make sure it contains Filled Orders or Position Statement data.' },
          { status: 400 }
        );
      }

      // Check if this is Position Statement format (already has PnL calculated)
      const isPositionStatement = csv.includes('Position Statement for');

      const trades: Trade[] = [];
      const now = new Date().toISOString();

      if (isPositionStatement) {
        // Position Statement: trades already have PnL, use them directly
        tosTrades.forEach(t => {
          const [year, month, day] = t.date.split('-');
          const [hours, minutes, seconds] = t.time.split(':');
          const entryDate = `${year}-${month}-${day}T${hours}:${minutes}:${seconds}-05:00`;

          trades.push({
            id: crypto.randomUUID(),
            userId,
            symbol: t.symbol,
            side: t.pnl && t.pnl >= 0 ? TradeSide.LONG : TradeSide.SHORT,
            status: TradeStatus.CLOSED,
            strategy: Strategy.DAY_TRADE,
            entryDate,
            entryPrice: Math.abs(t.pnl || 0), // Use PnL as entry for display
            exitDate: entryDate, // Same day close
            exitPrice: 0,
            shares: 1,
            netPnL: t.pnl || 0,
            createdAt: now,
            updatedAt: now,
            entryNotes: `Imported from TOS Position Statement - ${t.posEffect}`
          });
        });
      } else {
        // Trade Activity format: pair buys/sells to calculate PnL
        const bySymbol: Record<string, typeof tosTrades> = {};
        tosTrades.forEach(t => {
          if (!bySymbol[t.symbol]) bySymbol[t.symbol] = [];
          bySymbol[t.symbol].push(t);
        });

        Object.entries(bySymbol).forEach(([symbol, symbolTrades]) => {
          const buys = symbolTrades.filter(t => t.side === 'BUY').sort((a, b) => 
            new Date(a.date + 'T' + a.time).getTime() - new Date(b.date + 'T' + b.time).getTime()
          );
          const sells = symbolTrades.filter(t => t.side === 'SELL').sort((a, b) => 
            new Date(a.date + 'T' + b.time).getTime() - new Date(b.date + 'T' + b.time).getTime()
          );

          // Calculate PnL for completed round trips
          const minPairs = Math.min(buys.length, sells.length);
          for (let i = 0; i < minPairs; i++) {
            const buy = buys[i];
            const sell = sells[i];
            const shares = Math.min(buy.quantity, sell.quantity);
            const netPnL = (sell.price - buy.price) * shares;

            // Create entryDate with explicit EST timezone
            const [year, month, day] = buy.date.split('-');
            const [hours, minutes, seconds] = buy.time.split(':');
            const entryDate = `${year}-${month}-${day}T${hours}:${minutes}:${seconds}-05:00`;

            // Create exitDate
            const [sYear, sMonth, sDay] = sell.date.split('-');
            const [sHours, sMinutes, sSeconds] = sell.time.split(':');
            const exitDate = `${sYear}-${sMonth}-${sDay}T${sHours}:${sMinutes}:${sSeconds}-05:00`;

            trades.push({
              id: crypto.randomUUID(),
              userId,
              symbol,
              side: TradeSide.LONG,
              status: TradeStatus.CLOSED,
              strategy: Strategy.DAY_TRADE,
              entryDate,
              entryPrice: buy.price,
              exitDate,
              exitPrice: sell.price,
              shares,
              netPnL,
              createdAt: now,
              updatedAt: now,
              entryNotes: `Imported from TOS - Buy: ${buy.posEffect}, Sell: ${sell.posEffect}`
            });
          }

          // Handle unmatched orders (remaining buys or sells)
          const unmatchedBuys = buys.slice(minPairs);
          const unmatchedSells = sells.slice(minPairs);
          
          [...unmatchedBuys, ...unmatchedSells].forEach(t => {
            const [year, month, day] = t.date.split('-');
            const [hours, minutes, seconds] = t.time.split(':');
            const entryDate = `${year}-${month}-${day}T${hours}:${minutes}:${seconds}-05:00`;

            trades.push({
              id: crypto.randomUUID(),
              userId,
              symbol,
              side: t.side === 'BUY' ? TradeSide.LONG : TradeSide.SHORT,
              status: TradeStatus.OPEN,
              strategy: Strategy.DAY_TRADE,
              entryDate,
              entryPrice: t.price,
              shares: t.quantity,
              createdAt: now,
              updatedAt: now,
              entryNotes: `Imported from TOS - ${t.posEffect} (unmatched)`
            });
          });
        });
      }

      // Save to Redis
      await saveTrades(trades);

      return NextResponse.json({
        success: true,
        data: {
          imported: trades.length,
          failed: 0,
          errors: [],
          trades
        },
        count: trades.length
      });
    }

    // Generic CSV format
    const result = await importTradesFromCSV(csv, userId, {}, ',');

    return NextResponse.json({
      success: true,
      data: result,
      count: result.imported
    });

  } catch (error) {
    console.error('Error importing trades:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to import trades' },
      { status: 500 }
    );
  }
}

async function importTradesFromCSV(
  csv: string,
  userId: string,
  mapping: Record<string, string>,
  delimiter: string
): Promise<CSVImportResult> {
  const lines = csv.split('\n').filter((line) => line.trim());

  if (lines.length < 2) {
    return {
      success: false,
      imported: 0,
      failed: 0,
      errors: [{ row: 0, message: 'CSV must have at least a header and one data row', data: {} }],
      trades: [],
    };
  }

  // Parse header
  const headers = parseCSVLine(lines[0], delimiter);

  // Build column index mapping
  const columnMap: Record<string, number> = {};
  for (const [field, columnName] of Object.entries(mapping)) {
    const index = headers.findIndex(
      (h) => h.toLowerCase().trim() === columnName.toLowerCase().trim()
    );
    if (index !== -1) {
      columnMap[field] = index;
    }
  }

  // Auto-detect common column names if not mapped
  if (!columnMap.symbol) {
    columnMap.symbol = headers.findIndex(
      (h) => /symbol|ticker|stock|instrument/i.test(h)
    );
  }
  if (!columnMap.side) {
    columnMap.side = headers.findIndex(
      (h) => /side|type|direction|buy.?sell/i.test(h)
    );
  }
  if (!columnMap.entryDate) {
    columnMap.entryDate = headers.findIndex(
      (h) => /entry.?date|date|open.?date|time/i.test(h)
    );
  }
  if (!columnMap.entryPrice) {
    columnMap.entryPrice = headers.findIndex(
      (h) => /entry.?price|price|open.?price|entry/i.test(h)
    );
  }
  if (!columnMap.shares) {
    columnMap.shares = headers.findIndex(
      (h) => /shares|quantity|qty|size|units/i.test(h)
    );
  }
  if (!columnMap.exitDate) {
    columnMap.exitDate = headers.findIndex(
      (h) => /exit.?date|close.?date/i.test(h)
    );
  }
  if (!columnMap.exitPrice) {
    columnMap.exitPrice = headers.findIndex(
      (h) => /exit.?price|close.?price/i.test(h)
    );
  }

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
      const trade = parseTradeRow(row, columnMap, userId, i);
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

  // Save all trades to Redis
  if (trades.length > 0) {
    await saveTrades(trades);
  }

  return {
    success: errors.length === 0,
    imported: trades.length,
    failed: errors.length,
    errors,
    trades,
  };
}

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

function parseTradeRow(
  row: string[],
  columnMap: Record<string, number>,
  userId: string,
  rowIndex: number
): Trade | null {
  // Required fields
  const symbol = columnMap.symbol !== undefined ? row[columnMap.symbol]?.trim() : '';
  const sideValue = columnMap.side !== undefined ? row[columnMap.side]?.trim().toUpperCase() : '';
  const entryDate = columnMap.entryDate !== undefined ? row[columnMap.entryDate]?.trim() : '';
  const entryPriceStr = columnMap.entryPrice !== undefined ? row[columnMap.entryPrice]?.trim() : '';
  const sharesStr = columnMap.shares !== undefined ? row[columnMap.shares]?.trim() : '';

  if (!symbol) {
    throw new Error('Symbol is required');
  }

  // Parse side
  let side: TradeSide = TradeSide.LONG;
  if (sideValue) {
    if (sideValue === 'SHORT' || sideValue === 'SELL' || sideValue === 'S') {
      side = TradeSide.SHORT;
    } else if (sideValue === 'LONG' || sideValue === 'BUY' || sideValue === 'B') {
      side = TradeSide.LONG;
    }
  }

  // Parse entry price
  const entryPrice = parseFloat(entryPriceStr);
  if (isNaN(entryPrice) || entryPrice <= 0) {
    throw new Error('Valid entry price is required');
  }

  // Parse shares
  const shares = parseFloat(sharesStr);
  if (isNaN(shares) || shares <= 0) {
    throw new Error('Valid shares quantity is required');
  }

  // Parse dates
  let parsedEntryDate: string;
  try {
    const date = entryDate ? new Date(entryDate) : new Date();
    if (isNaN(date.getTime())) {
      parsedEntryDate = new Date().toISOString();
    } else {
      parsedEntryDate = date.toISOString();
    }
  } catch {
    parsedEntryDate = new Date().toISOString();
  }

  // Optional fields
  const exitPriceStr = columnMap.exitPrice !== undefined ? row[columnMap.exitPrice]?.trim() : '';
  const exitDate = columnMap.exitDate !== undefined ? row[columnMap.exitDate]?.trim() : '';

  const now = new Date().toISOString();

  const trade: Trade = {
    id: crypto.randomUUID(),
    userId,
    symbol: symbol.toUpperCase(),
    side,
    status: TradeStatus.OPEN,
    strategy: Strategy.OTHER,
    entryDate: parsedEntryDate,
    entryPrice,
    shares,
    createdAt: now,
    updatedAt: now,
  };

  // Parse exit information if available
  if (exitPriceStr) {
    const exitPrice = parseFloat(exitPriceStr);
    if (!isNaN(exitPrice) && exitPrice > 0) {
      trade.exitPrice = exitPrice;
      trade.status = TradeStatus.CLOSED;

      if (exitDate) {
        try {
          const parsedExitDate = new Date(exitDate);
          if (!isNaN(parsedExitDate.getTime())) {
            trade.exitDate = parsedExitDate.toISOString();
          }
        } catch {
          trade.exitDate = now;
        }
      } else {
        trade.exitDate = now;
      }

      // Calculate P&L
      const priceDiff = side === TradeSide.LONG
        ? exitPrice - entryPrice
        : entryPrice - exitPrice;
      const grossPnL = priceDiff * shares;
      const estimatedFees = 1 + (shares * 0.01 * 2);

      trade.grossPnL = grossPnL;
      trade.netPnL = grossPnL - estimatedFees;
      trade.returnPercent = (priceDiff / entryPrice) * 100;
    }
  }

  return trade;
}
