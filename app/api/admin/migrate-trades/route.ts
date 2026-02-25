/**
 * API route to migrate existing trades with incorrect timezone offsets
 * 
 * POST /api/admin/migrate-trades
 * 
 * This fixes trades that were stored with -05:00 offset during EDT (daylight saving time)
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAllTrades, saveTrades } from '@/lib/db/trades-v2';
import { getESTOffset, toESTISOString } from '@/lib/date-utils';

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    // Optional: Add authentication check here
    // const authHeader = request.headers.get('authorization');
    // if (!authHeader || !isValidAuth(authHeader)) {
    //   return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    // }
    
    const trades = await getAllTrades();
    let fixedCount = 0;
    
    const fixedTrades = trades.map(trade => {
      const originalEntryDate = trade.entryDate;
      
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
        console.log(`Fixing trade ${trade.id.slice(0, 8)}: ${originalEntryDate} -> ${toESTISOString(entryDateObj)}`);
        
        // Convert to correct offset
        trade.entryDate = toESTISOString(entryDateObj);
        fixedCount++;
      }
      
      // Also fix exitDate if it exists
      if (trade.exitDate) {
        const exitDateObj = new Date(trade.exitDate);
        if (!isNaN(exitDateObj.getTime())) {
          const exitCorrectOffset = getESTOffset(exitDateObj);
          const exitCurrentOffset = trade.exitDate.match(/([+-]\d{2}:\d{2})$/)?.[0] || '';
          
          if (exitCurrentOffset && exitCurrentOffset !== exitCorrectOffset) {
            trade.exitDate = toESTISOString(exitDateObj);
          }
        }
      }
      
      return trade;
    });
    
    // Save all trades (even unchanged ones - the save function handles deduplication)
    if (fixedCount > 0) {
      await saveTrades(fixedTrades);
    }
    
    return NextResponse.json({
      success: true,
      message: `Migration complete. Fixed ${fixedCount} of ${trades.length} trades.`,
      fixedCount,
      totalTrades: trades.length
    });
    
  } catch (error) {
    console.error('Migration error:', error);
    return NextResponse.json(
      { success: false, error: 'Migration failed' },
      { status: 500 }
    );
  }
}
