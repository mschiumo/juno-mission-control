/**
 * Date utilities for EST (America/New_York) timezone handling
 * All dates are stored with -05:00 offset to ensure consistency
 */

const EST_TIMEZONE = 'America/New_York';
const EST_OFFSET = '-05:00';

/**
 * Get current date/time in EST as ISO string with -05:00 offset
 * Use this instead of new Date().toISOString() which returns UTC
 */
export function getNowInEST(): string {
  const now = new Date();
  const estDateStr = now.toLocaleString('en-US', {
    timeZone: EST_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
  
  // Parse MM/DD/YYYY, HH:MM:SS format
  const [datePart, timePart] = estDateStr.split(', ');
  const [month, day, year] = datePart.split('/');
  return `${year}-${month}-${day}T${timePart}${EST_OFFSET}`;
}

/**
 * Get current date in EST as YYYY-MM-DD string
 */
export function getTodayInEST(): string {
  const now = new Date();
  const estDateStr = now.toLocaleDateString('en-US', {
    timeZone: EST_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  
  const [month, day, year] = estDateStr.split('/');
  return `${year}-${month}-${day}`;
}

/**
 * Get current time in EST as HH:MM:SS string
 */
export function getCurrentTimeInEST(): string {
  const now = new Date();
  return now.toLocaleTimeString('en-US', {
    timeZone: EST_TIMEZONE,
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}

/**
 * Convert a date string to EST ISO format with -05:00 offset
 * Handles various input formats
 */
export function toESTISOString(dateInput: string | Date): string {
  const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  
  if (isNaN(date.getTime())) {
    return getNowInEST();
  }
  
  const estDateStr = date.toLocaleString('en-US', {
    timeZone: EST_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
  
  const [datePart, timePart] = estDateStr.split(', ');
  const [month, day, year] = datePart.split('/');
  return `${year}-${month}-${day}T${timePart}${EST_OFFSET}`;
}

/**
 * Extract date portion (YYYY-MM-DD) from an EST ISO timestamp
 */
export function getESTDateFromTimestamp(isoTimestamp: string): string {
  // If it already has the date in YYYY-MM-DD format at the start, extract it
  const match = isoTimestamp.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    return match[0];
  }
  
  // Otherwise parse and convert
  return toESTISOString(isoTimestamp).split('T')[0];
}

/**
 * Parse a date string that might be in various formats and convert to EST
 * Returns YYYY-MM-DD string
 */
export function parseDateToEST(dateStr: string): string {
  // If already in YYYY-MM-DD format, assume it's correct
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return dateStr;
  }
  
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) {
    return getTodayInEST();
  }
  
  const estDateStr = date.toLocaleDateString('en-US', {
    timeZone: EST_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  
  const [month, day, year] = estDateStr.split('/');
  return `${year}-${month}-${day}`;
}

/**
 * Create start of day timestamp in EST for a given date string
 */
export function getStartOfDayEST(dateStr: string): string {
  const parsed = parseDateToEST(dateStr);
  return `${parsed}T00:00:00${EST_OFFSET}`;
}

/**
 * Create end of day timestamp in EST for a given date string
 */
export function getEndOfDayEST(dateStr: string): string {
  const parsed = parseDateToEST(dateStr);
  return `${parsed}T23:59:59${EST_OFFSET}`;
}

/**
 * Format a date for display in EST
 */
export function formatDateForDisplay(dateStr: string, options?: Intl.DateTimeFormatOptions): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', {
    timeZone: EST_TIMEZONE,
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    ...options
  });
}

/**
 * Format time for display in EST
 */
export function formatTimeForDisplay(dateStr: string, options?: Intl.DateTimeFormatOptions): string {
  const date = new Date(dateStr);
  return date.toLocaleTimeString('en-US', {
    timeZone: EST_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    ...options
  });
}
