/**
 * CSV Import API (Updated with Flexible Parser)
 *
 * POST /api/trades/import - Import trades from CSV
 *
 * Supports multiple formats:
 * 1. Standard Trade Format: Date, Symbol, Side, Entry_Price, Exit_Price, Shares, Entry_Time, Exit_Time, ...
 * 2. TOS Trade Activity: ThinkOrSwim filled orders export
 * 3. Schwab Account Statement: Position Statement format
 * 4. Generic CSV: Auto-detects columns
 *
 * Body (JSON):
 * - csv: string (CSV content)
 * - format: 'auto' | 'standard' | 'tos' | 'generic' (default: 'auto')
 * - delimiter: string (default: ',')
 *
 * Body (FormData):
 * - file: File (CSV file)
 * - format: string (default: 'auto')
 */

import { NextRequest, NextResponse } from 'next/server';
import type { Trade } from '@/types/trading';
import { Strategy } from '@/types/trading';
import { saveTrades } from '@/lib/db/trades-v2';
import { parseFlexibleCSV, detectCSVFormat, validateCSVFormat, CSVFormat, getFormatSample } from '@/lib/parsers/flexible-csv-parser';
import { getNowInEST } from '@/lib/date-utils';
import { requireUserId } from '@/lib/auth-session';

export async function POST(request: NextRequest): Promise<NextResponse> {
  const { userId, error: authError } = await requireUserId();
  if (authError) return authError;

  try {
    const contentType = request.headers.get('content-type') || '';
    let csv: string;
    let format: CSVFormat | 'auto' = 'auto';
    let delimiter = ',';

    if (contentType.includes('multipart/form-data')) {
      // Handle FormData (file upload)
      const formData = await request.formData();
      const file = formData.get('file') as File | null;
      format = (formData.get('format') as CSVFormat | 'auto') || 'auto';
      delimiter = (formData.get('delimiter') as string) || ',';

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
      format = body.format || 'auto';
      delimiter = body.delimiter || ',';

      if (!csv) {
        return NextResponse.json(
          { success: false, error: 'CSV data is required' },
          { status: 400 }
        );
      }
    }

    // Validate CSV format first
    const validation = validateCSVFormat(csv);
    if (!validation.valid) {
      return NextResponse.json(
        {
          success: false,
          error: validation.message,
          detectedFormat: validation.format,
          sample: getFormatSample(validation.format)
        },
        { status: 400 }
      );
    }

    // Auto-detect format if not specified
    const detectedFormat = format === 'auto' ? detectCSVFormat(csv) : format;

    // Parse CSV using flexible parser
    const result = parseFlexibleCSV(csv, {
      userId,
      delimiter,
      defaultStrategy: Strategy.DAY_TRADE,
    });

    // Save trades to Redis
    if (result.trades.length > 0) {
      await saveTrades(result.trades, userId);
    }

    return NextResponse.json({
      success: result.success,
      data: {
        imported: result.imported,
        failed: result.failed,
        errors: result.errors,
        trades: result.trades,
        detectedFormat,
      },
      count: result.imported
    });

  } catch (error) {
    console.error('Error importing trades:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to import trades'
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/trades/import
 *
 * Get supported import formats and validation info
 */
export async function GET(): Promise<NextResponse> {
  return NextResponse.json({
    success: true,
    formats: [
      {
        id: 'standard',
        name: 'Standard Trade Format',
        description: 'Clean CSV with Date, Symbol, Side, Entry_Price, Exit_Price, Shares columns',
        sample: getFormatSample('standard'),
        detectedBy: ['Entry_Price', 'Exit_Price', 'Side', 'Symbol columns'],
      },
      {
        id: 'tos',
        name: 'ThinkOrSwim / Schwab',
        description: 'TOS Trade Activity or Schwab Account Statement export',
        sample: getFormatSample('tos'),
        detectedBy: ['"Filled Orders"', '"TO OPEN"', '"TO CLOSE"', 'Position Statement'],
      },
      {
        id: 'generic',
        name: 'Generic CSV',
        description: 'Auto-detects symbol, price, quantity columns from various formats',
        sample: getFormatSample('generic'),
        detectedBy: ['Any CSV with Symbol/Ticker, Price, and Quantity columns'],
      },
    ],
    tips: [
      'The importer automatically detects your CSV format',
      'For best results, use the Standard Trade Format',
      'Dates can be in MM/DD/YY, YYYY-MM-DD, or ISO format',
      'Times should be in HH:MM or HH:MM:SS format',
      'Side can be: long/short, buy/sell, or b/s',
    ],
  });
}
