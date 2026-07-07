/**
 * Minimal RFC-4180 CSV parser — handles quoted fields, embedded commas,
 * escaped quotes ("") and CRLF/LF line endings. No dependency needed for the
 * small statement/sheet files this feature ingests.
 */

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let i = 0;

  const pushField = () => {
    row.push(field);
    field = '';
  };
  const pushRow = () => {
    // Skip fully empty trailing rows
    if (row.length > 1 || (row.length === 1 && row[0].trim() !== '')) rows.push(row);
    row = [];
  };

  while (i < text.length) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += ch;
      i++;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (ch === ',') {
      pushField();
      i++;
      continue;
    }
    if (ch === '\n' || ch === '\r') {
      pushField();
      pushRow();
      if (ch === '\r' && text[i + 1] === '\n') i++;
      i++;
      continue;
    }
    field += ch;
    i++;
  }
  if (field !== '' || row.length > 0) {
    pushField();
    pushRow();
  }
  return rows;
}

/** Normalize a header cell for loose matching: lowercase, alphanumerics only. */
export function normalizeHeader(h: string): string {
  return h.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Map header names to column indexes. `aliases` maps a canonical field name
 * to acceptable normalized header substrings, tried in order.
 */
export function mapColumns(
  headerRow: string[],
  aliases: Record<string, string[]>,
): Record<string, number> {
  const normalized = headerRow.map(normalizeHeader);
  const result: Record<string, number> = {};
  for (const [field, names] of Object.entries(aliases)) {
    for (const name of names) {
      const idx = normalized.findIndex((h) => h === name || h.includes(name));
      if (idx !== -1) {
        result[field] = idx;
        break;
      }
    }
  }
  return result;
}

/** Parse "$1,234.56", "(45.00)", "26.24%", "-12.3" → number; NaN when unparseable. */
export function parseMoney(raw: string): number {
  const trimmed = raw.trim();
  if (!trimmed) return NaN;
  const negative = /^\(.*\)$/.test(trimmed);
  const cleaned = trimmed.replace(/[()$,%\s]/g, '');
  const n = Number(cleaned);
  return negative ? -n : n;
}
