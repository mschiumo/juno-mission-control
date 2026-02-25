/**
 * Date utilities for EST (America/New_York) timezone handling
 * All dates are stored with proper EST/EDT offset to ensure consistency
 */

const EST_TIMEZONE = 'America/New_York';
const EST_OFFSET = '-05:00';
const EDT_OFFSET = '-04:00';

/**
 * Get the correct EST/EDT offset for a given date
 * Returns '-05:00' for EST (winter) or '-04:00' for EDT (summer/daylight saving)
 */
export function getESTOffset(date: Date = new Date()): string {
  // Format the date to see if we're in EDT or EST
  const timeString = date.toLocaleString('en-US', {
    timeZone: EST_TIMEZONE,
    timeZoneName: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
  
  // Check for EDT indicator - EDT is GMT-4, EST is GMT-5
  // During daylight saving time (roughly March-Nov), America/New_York uses EDT (-04:00)
  const isEDT = timeString.includes('EDT');
  return isEDT ? EDT_OFFSET : EST_OFFSET;
}

/**
 * Get current date/time in EST/EDT as ISO string with proper offset
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
  const offset = getESTOffset(now);
  return `${year}-${month}-${day}T${timePart}${offset}`;
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
 * Convert a date string to EST/EDT ISO format with proper offset
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
  const offset = getESTOffset(date);
  return `${year}-${month}-${day}T${timePart}${offset}`;
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
 * Create start of day timestamp in EST/EDT for a given date string
 */
export function getStartOfDayEST(dateStr: string): string {
  const parsed = parseDateToEST(dateStr);
  // Create a date to determine if we're in EST or EDT
  const date = new Date(`${parsed}T12:00:00`);
  const offset = getESTOffset(date);
  return `${parsed}T00:00:00${offset}`;
}

/**
 * Create end of day timestamp in EST/EDT for a given date string
 */
export function getEndOfDayEST(dateStr: string): string {
  const parsed = parseDateToEST(dateStr);
  // Create a date to determine if we're in EST or EDT
  const date = new Date(`${parsed}T12:00:00`);
  const offset = getESTOffset(date);
  return `${parsed}T23:59:59${offset}`;
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
