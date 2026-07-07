/**
 * Apple Card statement CSV parser.
 *
 * Wallet → Apple Card → statement → "Export Transactions" produces a CSV
 * with headers like:
 *   Transaction Date, Clearing Date, Description, Merchant, Category, Type, Amount (USD)
 * where purchases are positive and payments/credits negative.
 *
 * Header matching is loose (see mapColumns) so generic bank CSV exports with
 * date/description/amount columns also import — Apple Card is just the
 * primary target since it has no aggregator support (no Teller/Plaid; its
 * only API is FinanceKit, which is iOS-native only).
 */

import { parseCsv, mapColumns, parseMoney } from './csv';
import { FinanceTransaction } from './types';

const COLUMN_ALIASES: Record<string, string[]> = {
  date: ['transactiondate', 'date'],
  description: ['description', 'merchant', 'payee'],
  merchant: ['merchant'],
  category: ['category'],
  type: ['type'],
  amount: ['amountusd', 'amount'],
};

export interface CsvImportResult {
  transactions: Omit<FinanceTransaction, 'accountId' | 'importedAt'>[];
  skippedRows: number;
  dateRange: { from: string; to: string } | null;
}

/** "MM/DD/YYYY" or "YYYY-MM-DD" → "YYYY-MM-DD"; null when unparseable. */
function normalizeDate(raw: string): string | null {
  const t = raw.trim();
  const us = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (us) return `${us[3]}-${us[1].padStart(2, '0')}-${us[2].padStart(2, '0')}`;
  const iso = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  return null;
}

/** Stable dedupe id so re-importing an overlapping statement is a no-op. */
function transactionId(date: string, description: string, amount: number): string {
  const raw = `${date}|${description.toLowerCase().trim()}|${amount.toFixed(2)}`;
  // djb2 — cheap, deterministic, collision-safe enough for one card's statements
  let hash = 5381;
  for (let i = 0; i < raw.length; i++) hash = ((hash << 5) + hash + raw.charCodeAt(i)) | 0;
  return `txn_${(hash >>> 0).toString(36)}_${date.replace(/-/g, '')}`;
}

export function parseStatementCsv(text: string): CsvImportResult | string {
  const rows = parseCsv(text);
  if (rows.length < 2) return 'CSV has no data rows';

  const cols = mapColumns(rows[0], COLUMN_ALIASES);
  if (cols.date === undefined || cols.amount === undefined) {
    return 'Could not find date and amount columns — expected an Apple Card statement export (Transaction Date / Description / Category / Type / Amount)';
  }

  const transactions: CsvImportResult['transactions'] = [];
  let skippedRows = 0;

  for (const row of rows.slice(1)) {
    const date = normalizeDate(row[cols.date] ?? '');
    const amount = parseMoney(row[cols.amount] ?? '');
    if (!date || !Number.isFinite(amount)) {
      skippedRows++;
      continue;
    }
    const description =
      (cols.description !== undefined && row[cols.description]?.trim()) ||
      (cols.merchant !== undefined && row[cols.merchant]?.trim()) ||
      'Unknown';
    const type = (cols.type !== undefined && row[cols.type]?.trim()) || '';
    // Payments/credits: Apple Card exports them as negative amounts; some
    // banks flag them via Type instead — normalize both to negative.
    const isCredit = /payment|credit|refund/i.test(type) && amount > 0;
    const signedAmount = isCredit ? -amount : amount;

    transactions.push({
      id: transactionId(date, description, signedAmount),
      date,
      description,
      category:
        (cols.category !== undefined && row[cols.category]?.trim()) ||
        (signedAmount < 0 ? 'Payments' : 'Other'),
      amount: Math.round(signedAmount * 100) / 100,
      type,
    });
  }

  if (transactions.length === 0) return 'No valid transaction rows found in the CSV';

  const dates = transactions.map((t) => t.date).sort();
  return {
    transactions,
    skippedRows,
    dateRange: { from: dates[0], to: dates[dates.length - 1] },
  };
}
