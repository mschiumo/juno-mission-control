import { NextResponse } from 'next/server';
import { FALLBACK_UNIVERSE } from '@/lib/stock-universe';

/**
 * Gap Scanner Test Endpoint
 * 
 * This endpoint is for testing the gap scanner with a limited universe.
 * Use this for:
 * - Verifying API rate limits
 * - Testing timing without full 5000 stock scan
 * - Development and debugging
 */

interface TestResult {
  success: boolean;
  message: string;
  testConfig: {
    stockCount: number;
    batchSize: number;
    delayMs: number;
    expectedApiCalls: number;
    expectedDurationSeconds: number;
  };
  timing: {
    startTime: string;
    endTime: string;
    durationMs: number;
  };
  results?: {
    scanned: number;
    gainers: number;
    losers: number;
    sampleStocks: string[];
  };
  errors?: string[];
}

const FINNHUB_API_KEY = process.env.FINNHUB_API_KEY;

function getFinnhubApiKey(): string {
  if (!FINNHUB_API_KEY) {
    throw new Error('FINNHUB_API_KEY environment variable is required');
  }
  return FINNHUB_API_KEY;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  
  // Test configuration
  const stockCount = parseInt(searchParams.get('stocks') || '100', 10);
  const batchSize = parseInt(searchParams.get('batchSize') || '50', 10);
  const delayMs = parseInt(searchParams.get('delay') || '1000', 10);
  const minGap = parseFloat(searchParams.get('minGap') || '5');
  
  const startTime = Date.now();
  const timestamp = new Date().toISOString();
  const errors: string[] = [];
  
  try {
    // Validate inputs
    if (stockCount < 1 || stockCount > 500) {
      return NextResponse.json({
        success: false,
        error: 'stockCount must be between 1 and 500'
      }, { status: 400 });
    }
    
    if (batchSize < 1 || batchSize > 100) {
      return NextResponse.json({
        success: false,
        error: 'batchSize must be between 1 and 100'
      }, { status: 400 });
    }
    
    if (delayMs < 100 || delayMs > 10000) {
      return NextResponse.json({
        success: false,
        error: 'delay must be between 100ms and 10000ms'
      }, { status: 400 });
    }
    
    // Use fallback universe for testing
    const testSymbols = FALLBACK_UNIVERSE.slice(0, Math.min(stockCount, FALLBACK_UNIVERSE.length));
    
    // Add more symbols if needed (use generated symbols)
    if (testSymbols.length < stockCount) {
      const additionalNeeded = stockCount - testSymbols.length;
      for (let i = 1; i <= additionalNeeded; i++) {
        testSymbols.push(`TEST${i}`);
      }
    }
    
    const expectedApiCalls = testSymbols.length;
    const expectedDurationSeconds = Math.ceil((expectedApiCalls * delayMs) / 1000);
    
    console.log(`[GapScanner Test] Starting test with ${stockCount} stocks`);
    console.log(`[GapScanner Test] Expected duration: ~${expectedDurationSeconds}s`);
    
    // Run test scan
    const apiKey = getFinnhubApiKey();
    let scanned = 0;
    let gainers = 0;
    let losers = 0;
    let apiFailures = 0;
    
    // Process in batches
    const batches = Math.ceil(testSymbols.length / batchSize);
    const sampleResults: string[] = [];
    
    for (let batchIndex = 0; batchIndex < batches; batchIndex++) {
      const start = batchIndex * batchSize;
      const end = Math.min(start + batchSize, testSymbols.length);
      const batch = testSymbols.slice(start, end);
      
      console.log(`[GapScanner Test] Processing batch ${batchIndex + 1}/${batches}`);
      
      // Process each symbol in batch
      for (const symbol of batch) {
        try {
          const response = await fetch(
            `https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${apiKey}`,
            { next: { revalidate: 0 } }
          );
          
          if (!response.ok) {
            apiFailures++;
            continue;
          }
          
          const data = await response.json();
          
          if (data && data.c !== 0 && data.pc !== 0) {
            const gapPercent = ((data.c - data.pc) / data.pc) * 100;
            
            scanned++;
            
            if (Math.abs(gapPercent) >= minGap) {
              if (gapPercent > 0) {
                gainers++;
              } else {
                losers++;
              }
              
              // Keep first 5 samples
              if (sampleResults.length < 5) {
                sampleResults.push(`${symbol}: ${gapPercent.toFixed(2)}%`);
              }
            }
          }
          
        } catch (error) {
          apiFailures++;
        }
        
        // Rate limiting
        await new Promise(r => setTimeout(r, delayMs));
      }
      
      console.log(`[GapScanner Test] Batch ${batchIndex + 1} complete`);
    }
    
    const durationMs = Date.now() - startTime;
    
    const result: TestResult = {
      success: true,
      message: `Test completed successfully`,
      testConfig: {
        stockCount,
        batchSize,
        delayMs,
        expectedApiCalls,
        expectedDurationSeconds
      },
      timing: {
        startTime: timestamp,
        endTime: new Date().toISOString(),
        durationMs
      },
      results: {
        scanned,
        gainers,
        losers,
        sampleStocks: sampleResults
      }
    };
    
    if (apiFailures > 0) {
      errors.push(`${apiFailures} API failures`);
      result.errors = errors;
    }
    
    console.log(`[GapScanner Test] Completed in ${durationMs}ms`);
    console.log(`[GapScanner Test] Found: ${gainers} gainers, ${losers} losers`);
    
    return NextResponse.json(result);
    
  } catch (error) {
    const durationMs = Date.now() - startTime;
    const errorMsg = error instanceof Error ? error.message : String(error);
    
    console.error('[GapScanner Test] Error:', errorMsg);
    
    return NextResponse.json({
      success: false,
      message: 'Test failed',
      testConfig: {
        stockCount,
        batchSize,
        delayMs,
        expectedApiCalls: stockCount,
        expectedDurationSeconds: Math.ceil((stockCount * delayMs) / 1000)
      },
      timing: {
        startTime: timestamp,
        endTime: new Date().toISOString(),
        durationMs
      },
      errors: [errorMsg]
    }, { status: 500 });
  }
}

/**
 * POST endpoint for quick validation tests
 */
export async function POST(request: Request) {
  const body = await request.json();
  const { action } = body;
  
  if (action === 'validate-api') {
    // Quick API validation test
    try {
      const apiKey = getFinnhubApiKey();
      const response = await fetch(
        `https://finnhub.io/api/v1/quote?symbol=AAPL&token=${apiKey}`,
        { next: { revalidate: 0 } }
      );
      
      if (response.ok) {
        const data = await response.json();
        return NextResponse.json({
          success: true,
          message: 'API key is valid',
          sample: {
            symbol: 'AAPL',
            price: data.c,
            previousClose: data.pc
          }
        });
      } else {
        return NextResponse.json({
          success: false,
          error: `API returned ${response.status}`
        }, { status: 500 });
      }
      
    } catch (error) {
      return NextResponse.json({
        success: false,
        error: error instanceof Error ? error.message : String(error)
      }, { status: 500 });
    }
  }
  
  if (action === 'rate-limit-check') {
    // Test rate limits with burst requests
    const apiKey = getFinnhubApiKey();
    const symbols = ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'TSLA', 'META', 'NVDA', 'JPM', 'V', 'PG'];
    const results: { symbol: string; status: number; timeMs: number }[] = [];
    
    const start = Date.now();
    
    for (const symbol of symbols) {
      const reqStart = Date.now();
      try {
        const response = await fetch(
          `https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${apiKey}`,
          { next: { revalidate: 0 } }
        );
        results.push({
          symbol,
          status: response.status,
          timeMs: Date.now() - reqStart
        });
      } catch (error) {
        results.push({
          symbol,
          status: 0,
          timeMs: Date.now() - reqStart
        });
      }
    }
    
    const totalTime = Date.now() - start;
    
    return NextResponse.json({
      success: true,
      message: `Rate limit test: ${symbols.length} requests in ${totalTime}ms`,
      results,
      totalTimeMs: totalTime,
      averageTimeMs: Math.round(totalTime / symbols.length)
    });
  }
  
  return NextResponse.json({
    success: false,
    error: 'Unknown action'
  }, { status: 400 });
}
