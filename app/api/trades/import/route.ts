/**
 * CSV Import API
 * 
 * POST /api/trades/import - Import trades from CSV
 */

import { NextRequest, NextResponse } from 'next/server';
import type { Trade, CSVImportResult, CSVImportError, CreateTradeRequest } from '@/types/trading';
import { Strategy, TradeStatus } from '@/types/trading';

// Reference to the trades store
declare global {
  var tradesStore: Map<string, Trade> | undefined;
}

const tradesStore: Map<string, Trade> = global.tradesStore || new Map();
if (!global.tradesStore) {
  global.tradesStore = tradesStore;
}

/**
 * POST /api/trades/import
 * 
 * Import trades from CSV data
 * 
 * Body:
 * - csv: string (CSV content)
 * - userId: string (required)
 * - mapping: CSVImportMapping (column mapping configuration)
 * - delimiter: string (default: ',')
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json();
    const { csv, userId, mapping, delimiter = ',' } = body;
    
    if (!csv || !userId) {
      return NextResponse.json(
        { success: false, error: 'CSV data and userId are required' },
        { status: 400 }
      );
    }
    
    const result = await importTradesFromCSV(csv, userId, mapping, delimiter);
    
    return NextResponse.json({ success: true, data: result });
    
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
        tradesStore.set(trade.id, trade);
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
  let side: 'LONG' | 'SHORT' = 'LONG';
  if (sideValue) {
    if (sideValue === 'SHORT' || sideValue === 'SELL' || sideValue === 'S') {
      side = 'SHORT';
    } else if (sideValue === 'LONG' || sideValue === 'BUY' || sideValue === 'B') {
      side = 'LONG';
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
      const priceDiff = side === 'LONG' 
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
