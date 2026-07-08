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
import { saveTradesReplacingByDate } from '@/lib/db/trades-v2';
import { saveDailyBalances } from '@/lib/db/balances';
import { saveDailyFees } from '@/lib/db/fees';
import { parseFlexibleCSV, detectCSVFormat, validateCSVFormat, CSVFormat, getFormatSample } from '@/lib/parsers/flexible-csv-parser';
import { getNowInEST } from '@/lib/date-utils';
import { requireUserId } from '@/lib/auth-session';
import { getRedisClient } from '@/lib/redis';

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

      // Excel and other binary files decode to garbage via file.text() and
      // would otherwise fail later with a confusing "column not found" error.
      // .xlsx is a zip archive (starts "PK"); legacy .xls and other binary
      // formats surface as NUL bytes or U+FFFD replacement chars.
      const fileName = (file.name || '').toLowerCase();
      const head = csv.slice(0, 2000);
      const looksBinary = head.startsWith('PK') || head.includes('\u0000') || head.includes('\uFFFD');
      if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls') || looksBinary) {
        return NextResponse.json(
          {
            success: false,
            error: 'This looks like an Excel or binary file — only plain-text CSV files can be imported.',
            hints: [
              'In thinkorswim, export the Account Statement as CSV (Monitor → Account Statement → export/print icon → CSV).',
              'If you only have an Excel file, open it and use File → Save As → "CSV (Comma delimited)".',
            ],
          },
          { status: 400 }
        );
      }
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
          hints: validation.hints,
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

    // Nothing usable in the file at all — fail explicitly with the parser's
    // reason and per-row details instead of a silent success:false payload
    // the UI can't explain.
    const hasBalanceData =
      (result.startingBalance && result.startingBalance > 0) ||
      (result.dailyBalances && result.dailyBalances.length > 0) ||
      (result.dailyFees && result.dailyFees.length > 0);
    if (result.trades.length === 0 && !hasBalanceData) {
      // errors[0].row === 0 marks a file-level message; otherwise every data
      // row failed individually and we summarize instead.
      const fileLevelError = result.errors[0]?.row === 0 ? result.errors[0].message : undefined;
      return NextResponse.json(
        {
          success: false,
          error: fileLevelError ||
            (result.failed > 0
              ? `No trades could be imported — all ${result.failed} data row${result.failed === 1 ? '' : 's'} failed. See row details below.`
              : 'No trades could be read from this file.'),
          hints: result.hints || [
            'Check that the export covers a date range where you actually traded.',
            'In thinkorswim, export the full Account Statement (Monitor → Account Statement → CSV).',
          ],
          rowErrors: result.errors.filter(e => e.row > 0).slice(0, 20).map(e => ({ row: e.row, message: e.message })),
          detectedFormat,
        },
        { status: 400 }
      );
    }

    // Save trades to Redis
    if (result.trades.length > 0) {
      await saveTradesReplacingByDate(result.trades, userId);
    }

    // Persist starting balance from account statement if available. Only
    // overwrite when the new file's anchor is *earlier* than what's stored —
    // daily uploads shouldn't keep ratcheting the baseline forward and
    // double-counting prior days' P&L.
    if (result.startingBalance && result.startingBalance > 0) {
      try {
        const redis = await getRedisClient();
        const prefsKey = `user:prefs:${userId}`;
        const raw = await redis.get(prefsKey);
        const prefs = raw ? JSON.parse(raw as string) : {};
        const incomingAnchor = result.dailyBalances?.[0]?.date;
        const storedAnchor = prefs.startingBalanceDate;
        const isEarlier = incomingAnchor && (!storedAnchor || incomingAnchor < storedAnchor);
        const noStoredBalance = !prefs.startingBalance || prefs.startingBalance <= 0;
        if (isEarlier || noStoredBalance) {
          prefs.startingBalance = result.startingBalance;
          if (incomingAnchor) prefs.startingBalanceDate = incomingAnchor;
          await redis.set(prefsKey, JSON.stringify(prefs));
        }
      } catch (e) {
        console.error('Failed to save starting balance from import:', e);
      }
    }

    // Persist daily balances from account statement. These accumulate across
    // uploads so the Equity Curve can plot the broker's authoritative NLV
    // for every day, instead of deriving it from starting balance + P&L.
    if (result.dailyBalances && result.dailyBalances.length > 0) {
      try {
        await saveDailyBalances(result.dailyBalances, userId);
      } catch (e) {
        console.error('Failed to save daily balances from import:', e);
      }
    }

    if (result.dailyFees && result.dailyFees.length > 0) {
      try {
        await saveDailyFees(result.dailyFees, userId);
      } catch (e) {
        console.error('Failed to save daily fees from import:', e);
      }
    }

    // Non-fatal problems the user should still see after a save: skipped rows,
    // trade-less balance updates, and Account Statements missing Cash Balance
    // activity (fees/balances can't be derived, so metrics would silently go
    // stale on re-import).
    const warnings: string[] = [];
    if (result.failed > 0) {
      warnings.push(
        `${result.failed} row${result.failed === 1 ? '' : 's'} could not be imported and ${result.failed === 1 ? 'was' : 'were'} skipped. See row details below.`
      );
    }
    if (result.trades.length === 0) {
      warnings.push('No trades were found in this file, but account balances/fees were updated.');
    }
    if (result.cashBalanceEmpty) {
      warnings.push('This Account Statement has no Cash Balance activity, so broker fees and daily balances were not updated. Re-export from thinkorswim with the Cash Balance section included.');
    }

    return NextResponse.json({
      success: true,
      data: {
        imported: result.imported,
        failed: result.failed,
        errors: result.errors,
        trades: result.trades,
        detectedFormat,
        startingBalance: result.startingBalance,
        dailyBalances: result.dailyBalances,
      },
      count: result.imported,
      // Kept for older clients that read a single `warning` string.
      warning: warnings[0],
      warnings: warnings.length > 0 ? warnings : undefined,
      rowErrors: result.failed > 0
        ? result.errors.filter(e => e.row > 0).slice(0, 20).map(e => ({ row: e.row, message: e.message }))
        : undefined,
    });

  } catch (error) {
    console.error('Error importing trades:', error);
    return NextResponse.json(
      {
        success: false,
        error: `Something went wrong on the server while importing: ${error instanceof Error ? error.message : 'unknown error'}`,
        hints: [
          'Try the import again — transient storage errors usually resolve on retry.',
          'If it keeps failing, the file may contain unexpected formatting; try re-exporting it from your broker.',
        ],
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
