/**
 * CSV Import API
 * 
 * POST /api/trades/import - Import trades from CSV
 * 
 * Supports formats:
 * - Generic CSV (with column mapping)
 * - ThinkOrSwim (TOS) format
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from 'redis';
import type { Trade } from '@/types/trading';
import { isTOSFormat, parseTOSCSV, TOSImportResult } from '@/lib/parsers/tos-parser';

const STORAGE_KEY = 'trades_data';

let redisClient: ReturnType<typeof createClient> | null = null;

async function getRedisClient() {
  if (redisClient) return redisClient;
  
  try {
    const client = createClient({ url: process.env.REDIS_URL || undefined });
    client.on('error', (err) => console.error('Redis Client Error:', err));
    await client.connect();
    redisClient = client;
    return client;
  } catch (error) {
    console.error('Failed to connect to Redis:', error);
    return null;
  }
}

/**
 * POST /api/trades/import
 * 
 * Import trades from CSV data
 * 
 * Body:
 * - csv: string (CSV content)
 * - userId: string (required)
 * - format: 'auto' | 'tos' | 'generic' (default: 'auto')
 * - mapping: Record<string, string> (column mapping for generic format)
 * - delimiter: string (default: ',')
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json();
    const { csv, userId, format = 'auto', mapping, delimiter = ',' } = body;
    
    if (!csv || !userId) {
      return NextResponse.json(
        { success: false, error: 'CSV data and userId are required' },
        { status: 400 }
      );
    }
    
    let result: TOSImportResult;
    
    // Detect format
    const detectedFormat = format === 'auto' 
      ? (isTOSFormat(csv) ? 'tos' : 'generic')
      : format;
    
    if (detectedFormat === 'tos') {
      // Use TOS parser
      result = parseTOSCSV(csv, userId);
    } else {
      // Use generic CSV parser
      result = await importGenericCSV(csv, userId, mapping || {}, delimiter);
    }
    
    // Save trades to Redis if successful
    if (result.trades.length > 0) {
      const redis = await getRedisClient();
      if (redis) {
        const stored = await redis.get(STORAGE_KEY);
        const existingTrades: Trade[] = stored ? JSON.parse(stored) : [];
        
        // Avoid duplicates by checking symbol + entryTime + shares
        const newTrades = result.trades.filter(newTrade => {
          return !existingTrades.some(existing => 
            existing.symbol === newTrade.symbol &&
            existing.entryTime === newTrade.entryTime &&
            existing.shares === newTrade.shares
          );
        });
        
        if (newTrades.length > 0) {
          existingTrades.push(...newTrades);
          await redis.set(STORAGE_KEY, JSON.stringify(existingTrades));
        }
        
        // Update result to reflect actual new imports
        result.imported = newTrades.length;
      }
    }
    
    return NextResponse.json({ 
      success: true, 
      data: result,
      format: detectedFormat
    });
    
  } catch (error) {
    console.error('Error importing trades:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to import trades' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/trades/import/formats
 * 
 * Get supported import formats
 */
export async function GET(): Promise<NextResponse> {
  return NextResponse.json({
    success: true,
    formats: [
      {
        id: 'tos',
        name: 'ThinkOrSwim (TOS)',
        description: 'TD Ameritrade / Schwab ThinkOrSwim platform exports',
        autoDetect: true,
        markers: ['TD Ameritrade', 'paperMoney', 'Account Trade History'],
      },
      {
        id: 'generic',
        name: 'Generic CSV',
        description: 'Standard CSV with configurable column mapping',
        autoDetect: false,
        requiredColumns: ['symbol', 'side', 'entryPrice', 'shares', 'entryTime'],
      },
    ],
  });
}

async function importGenericCSV(
  csv: string,
  userId: string,
  mapping: Record<string, string>,
  delimiter: string
): Promise<TOSImportResult> {
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
  if (columnMap.symbol === undefined) {
    columnMap.symbol = headers.findIndex((h) => /symbol|ticker|stock|instrument/i.test(h));
  }
  if (columnMap.side === undefined) {
    columnMap.side = headers.findIndex((h) => /side|type|direction|buy.?sell/i.test(h));
  }
  if (columnMap.entryTime === undefined) {
    columnMap.entryTime = headers.findIndex((h) => /entry.?time|time|open.?time|date/i.test(h));
  }
  if (columnMap.entryPrice === undefined) {
    columnMap.entryPrice = headers.findIndex((h) => /entry.?price|price|open.?price|entry/i.test(h));
  }
  if (columnMap.shares === undefined) {
    columnMap.shares = headers.findIndex((h) => /shares|quantity|qty|size|units/i.test(h));
  }
  if (columnMap.exitTime === undefined) {
    columnMap.exitTime = headers.findIndex((h) => /exit.?time|close.?time/i.test(h));
  }
  if (columnMap.exitPrice === undefined) {
    columnMap.exitPrice = headers.findIndex((h) => /exit.?price|close.?price/i.test(h));
  }
  
  const errors: { row: number; message: string; data: Record<string, string> }[] = [];
  const trades: Trade[] = [];
  
  // Parse data rows
  for (let i = 1; i < lines.length; i++) {
    const row = parseCSVLine(lines[i], delimiter);
    const rowData: Record<string, string> = {};
    headers.forEach((header, idx) => {
      rowData[header] = row[idx] || '';
    });
    
    try {
      const trade = parseGenericTradeRow(row, columnMap, userId, i);
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

function parseGenericTradeRow(
  row: string[],
  columnMap: Record<string, number>,
  userId: string,
  rowIndex: number
): Trade | null {
  // Required fields
  const symbol = columnMap.symbol !== undefined ? row[columnMap.symbol]?.trim() : '';
  const sideValue = columnMap.side !== undefined ? row[columnMap.side]?.trim().toLowerCase() : '';
  const entryTime = columnMap.entryTime !== undefined ? row[columnMap.entryTime]?.trim() : '';
  const entryPriceStr = columnMap.entryPrice !== undefined ? row[columnMap.entryPrice]?.trim() : '';
  const sharesStr = columnMap.shares !== undefined ? row[columnMap.shares]?.trim() : '';
  
  if (!symbol) {
    throw new Error('Symbol is required');
  }
  
  // Parse side
  let side: 'long' | 'short' = 'long';
  if (sideValue) {
    if (sideValue === 'short' || sideValue === 'sell' || sideValue === 's') {
      side = 'short';
    } else if (sideValue === 'long' || sideValue === 'buy' || sideValue === 'b') {
      side = 'long';
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
  let parsedEntryTime: string;
  try {
    const date = entryTime ? new Date(entryTime) : new Date();
    if (isNaN(date.getTime())) {
      parsedEntryTime = new Date().toISOString();
    } else {
      parsedEntryTime = date.toISOString();
    }
  } catch {
    parsedEntryTime = new Date().toISOString();
  }
  
  // Optional fields
  const exitPriceStr = columnMap.exitPrice !== undefined ? row[columnMap.exitPrice]?.trim() : '';
  const exitTime = columnMap.exitTime !== undefined ? row[columnMap.exitTime]?.trim() : '';
  
  const now = new Date().toISOString();
  
  // Calculate P&L if exit info available
  let pnl: number | null = null;
  let netPnl: number | null = null;
  let fees = 0;
  let parsedExitTime: string | null = null;
  let parsedExitPrice: number | null = null;
  
  if (exitPriceStr) {
    const exitPrice = parseFloat(exitPriceStr);
    if (!isNaN(exitPrice) && exitPrice > 0) {
      parsedExitPrice = exitPrice;
      
      const priceDiff = side === 'long' 
        ? exitPrice - entryPrice 
        : entryPrice - exitPrice;
      pnl = priceDiff * shares;
      fees = 1 + (shares * 0.01 * 2);
      netPnl = pnl - fees;
      
      if (exitTime) {
        try {
          const parsed = new Date(exitTime);
          if (!isNaN(parsed.getTime())) {
            parsedExitTime = parsed.toISOString();
          }
        } catch {
          parsedExitTime = now;
        }
      } else {
        parsedExitTime = now;
      }
    }
  }
  
  const trade: Trade = {
    id: `trade_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    userId,
    symbol: symbol.toUpperCase(),
    side,
    entryPrice,
    exitPrice: parsedExitPrice,
    shares,
    entryTime: parsedEntryTime,
    exitTime: parsedExitTime,
    pnl,
    fees,
    netPnl,
    strategy: 'other',
    setupType: '',
    tags: [],
    emotion: 'neutral',
    mistakes: '',
    notes: '',
    screenshots: [],
    chartUrl: null,
    createdAt: now,
    updatedAt: now,
  };
  
  return trade;
}