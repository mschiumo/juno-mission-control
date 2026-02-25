/**
 * Migration script to fix existing trades with incorrect EST/EDT offsets
 * 
 * During daylight saving time, trades were being stored with -05:00 (EST) offset
 * instead of -04:00 (EDT). This script fixes those timestamps.
 * 
 * Usage: ts-node scripts/migrate-trade-dates.ts
 */

import { getAllTrades, saveTrades } from '../lib/db/trades-v2';
import { getESTOffset, toESTISOString } from '../lib/date-utils';

async function migrateTradeDates() {
  console.log('Starting trade date migration...\n');
  
  const trades = await getAllTrades();
  console.log(`Found ${trades.length} trades to check`);
  
  let fixedCount = 0;
  const fixedTrades = trades.map(trade => {
    const originalEntryDate = trade.entryDate;
    const originalExitDate = trade.exitDate;
    
    // Parse the entry date
    const entryDateObj = new Date(originalEntryDate);
    if (isNaN(entryDateObj.getTime())) {
      console.warn(`Invalid entry date for trade ${trade.id}: ${originalEntryDate}`);
      return trade;
    }
    
    // Get the correct offset for this date
    const correctOffset = getESTOffset(entryDateObj);
    const currentOffset = originalEntryDate.match(/([+-]\d{2}:\d{2})$/)?.[0] || '';
    
    // Check if the offset needs fixing
    if (currentOffset && currentOffset !== correctOffset) {
      console.log(`Fixing trade ${trade.id.slice(0, 8)}...`);
      console.log(`  Original: ${originalEntryDate}`);
      
      // Convert to correct offset
      const fixedEntryDate = toESTISOString(entryDateObj);
      trade.entryDate = fixedEntryDate;
      
      console.log(`  Fixed:    ${fixedEntryDate}`);
      fixedCount++;
    }
    
    // Also fix exitDate if it exists
    if (originalExitDate) {
      const exitDateObj = new Date(originalExitDate);
      if (!isNaN(exitDateObj.getTime())) {
        const exitCorrectOffset = getESTOffset(exitDateObj);
        const exitCurrentOffset = originalExitDate.match(/([+-]\d{2}:\d{2})$/)?.[0] || '';
        
        if (exitCurrentOffset && exitCurrentOffset !== exitCorrectOffset) {
          trade.exitDate = toESTISOString(exitDateObj);
        }
      }
    }
    
    return trade;
  });
  
  if (fixedCount > 0) {
    console.log(`\nFixing ${fixedCount} trades...`);
    await saveTrades(fixedTrades);
    console.log('Migration complete!');
  } else {
    console.log('\nNo trades needed fixing.');
  }
}

// Run migration if called directly
if (require.main === module) {
  migrateTradeDates()
    .then(() => {
      console.log('\nDone!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Migration failed:', error);
      process.exit(1);
    });
}

export { migrateTradeDates };
