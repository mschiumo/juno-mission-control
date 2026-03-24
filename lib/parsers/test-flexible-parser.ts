/**
 * Test script for Flexible CSV Parser
 * Run: npx ts-node lib/parsers/test-flexible-parser.ts
 */

import { parseFlexibleCSV, detectCSVFormat, validateCSVFormat, getFormatSample } from './flexible-csv-parser';

// Test 1: Standard Format (User's working format)
const standardCSV = `Date,Symbol,Side,Entry_Price,Exit_Price,Shares,Entry_Time,Exit_Time,Fees,Strategy,Setup_Type,Tags,Emotion,Notes
2026-03-23,FFAI,short,0.3146,0.3119,1313,06:30,06:31,,,,,,
2026-03-23,GMEX,long,1.175,1.195,2000,06:33,06:33,,,,,,
2026-03-23,NFE,long,0.8,0.8167,8000,06:30,06:34,,,,,,`;

// Test 2: TOS Format
const tosCSV = `Filled Orders
,,Exec Time,Spread,Side,Qty,Pos Effect,Symbol,Exp,Strike,Type,Price,Net Price,Order Type
,,3/23/26 06:30:45,STOCK,SELL,-1313,TO CLOSE,FFAI,,,STOCK,0.3119,0.3119,MKT
,,3/23/26 06:31:08,STOCK,BUY,+1313,TO OPEN,FFAI,,,STOCK,0.3146,0.3146,LMT`;

// Test 3: Schwab Account Statement (simplified)
const schwabCSV = `Account Statement for 34629573 (brokerage) since 3/21/26
Account Order History Notes,,Time Placed,Spread,Side,Qty,Pos Effect,Symbol,Exp,Strike,Type,PRICE,,TIF,Status
,,3/23/26 06:30:45,STOCK,SELL,-1313,TO CLOSE,FFAI,,,STOCK,~,MKT,DAY,FILLED
,,3/23/26 06:31:08,STOCK,BUY,+1313,TO OPEN,FFAI,,,STOCK,~,MKT,DAY,FILLED

Account Trade History
,Exec Time,Spread,Side,Qty,Pos Effect,Symbol,Exp,Strike,Type,Price,Net Price,Order Type
,3/23/26 06:30:45,STOCK,SELL,-1313,TO CLOSE,FFAI,,,STOCK,0.3119,0.3119,MKT
,3/23/26 06:31:08,STOCK,BUY,+1313,TO OPEN,FFAI,,,STOCK,0.3146,0.3146,LMT`;

// Test 4: Generic CSV
const genericCSV = `symbol,price,quantity,date
AAPL,150.00,100,2026-03-23
TSLA,175.50,50,2026-03-23`;

function runTests() {
  console.log('🧪 Testing Flexible CSV Parser\n');
  
  const testCases = [
    { name: 'Standard Format', csv: standardCSV },
    { name: 'TOS Format', csv: tosCSV },
    { name: 'Schwab Format', csv: schwabCSV },
    { name: 'Generic CSV', csv: genericCSV },
  ];
  
  for (const test of testCases) {
    console.log(`\n📄 Testing: ${test.name}`);
    console.log('=' .repeat(50));
    
    // Detect format
    const detectedFormat = detectCSVFormat(test.csv);
    console.log(`  Detected format: ${detectedFormat}`);
    
    // Validate
    const validation = validateCSVFormat(test.csv);
    console.log(`  Valid: ${validation.valid}`);
    if (!validation.valid) {
      console.log(`  Validation error: ${validation.message}`);
    }
    
    // Parse
    const result = parseFlexibleCSV(test.csv, { userId: 'test-user' });
    console.log(`  Imported: ${result.imported} trades`);
    console.log(`  Failed: ${result.failed} rows`);
    
    if (result.errors.length > 0) {
      console.log(`  Errors:`, result.errors.slice(0, 3));
    }
    
    if (result.trades.length > 0) {
      const firstTrade = result.trades[0];
      console.log(`  First trade: ${firstTrade.symbol} ${firstTrade.side} @ $${firstTrade.entryPrice} (${firstTrade.shares} shares)`);
      if (firstTrade.exitPrice) {
        console.log(`    Exit: $${firstTrade.exitPrice}, P&L: $${firstTrade.netPnL?.toFixed(2)}`);
      }
    }
  }
  
  console.log('\n\n📋 Format Samples:');
  console.log('=' .repeat(50));
  const formats: Array<'standard' | 'tos' | 'generic'> = ['standard', 'tos', 'generic'];
  for (const fmt of formats) {
    console.log(`\n${fmt.toUpperCase()} Format:`);
    console.log(getFormatSample(fmt));
  }
}

// Run tests
runTests();
