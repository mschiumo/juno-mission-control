# Gap Scanner 5000 - Implementation Notes

## Overview
Updated the Gap Scanner to scan 5,000 stocks (up from 50) with market cap > $100M, scheduled for 8:30 AM EST daily.

## Changes Made

### 1. New File: `lib/stock-universe.ts`
Manages the stock universe of 5,000 stocks:
- Fetches all US stocks from Finnhub (NYSE + NASDAQ)
- Gets market cap for each stock via batch API calls
- Filters by market cap > $100M
- Sorts by market cap descending
- Stores top 5,000 in Redis with 7-day TTL
- Provides fallback of 100 liquid stocks if Redis unavailable

Key functions:
- `buildStockUniverse()` - Full rebuild (runs ~10-15 min)
- `getStockUniverse()` - Returns cached symbols
- `getStockInfoMap()` - Returns symbols with market cap data
- `refreshStockUniverse()` - Force refresh

### 2. Updated: `app/api/gap-scanner/route.ts`
Complete rewrite with batch processing:
- Loads 5,000 stocks from `lib/stock-universe.ts`
- Batch fetch: 50 stocks per minute cycle (1 API call per second)
- Total time: ~100 calls × 1s = ~1.7 minutes
- Filters: |gap| > 5%, volume > 100K, price < $1000, market cap > $100M
- Sorts by absolute gap % descending
- Stores top 20 gainers and losers in Redis
- Caches results for the day

Query parameters:
- `?dryRun=true` - Fetch but don't save results
- `?limit=100` - Test with limited universe
- `?refresh=true` - Force refresh stock universe
- `?cache=false` - Skip cached results
- `?minGap=3` - Adjust minimum gap percentage

### 3. New File: `app/api/gap-scanner/test/route.ts`
Test endpoint for validation:
- `GET /api/gap-scanner/test?stocks=100` - Test with N stocks
- `POST /api/gap-scanner/test` with `{"action": "validate-api"}` - API validation
- `POST /api/gap-scanner/test` with `{"action": "rate-limit-check"}` - Rate limit test

### 4. New File: `cron-gap-scanner.yaml`
Dedicated cron job configuration:
- Schedule: 8:30 AM EST (13:30 UTC), Mon-Fri
- 5-minute timeout
- Runs isolated session

### 5. Updated: `app/api/cron-status/route.ts`
Updated gap-scanner schedule from 7:30 AM to 8:30 AM EST.

## API Usage Estimate

- 5,000 stocks / 50 per minute = 100 API calls
- 100 calls × 1s = ~100 seconds total
- Well within Finnhub free tier (60 calls/minute)

## Testing Plan

1. **API Validation**
   ```
   POST /api/gap-scanner/test
   {"action": "validate-api"}
   ```

2. **Small Batch Test (100 stocks)**
   ```
   GET /api/gap-scanner?limit=100&cache=false
   ```

3. **Full Test (5,000 stocks)**
   ```
   GET /api/gap-scanner?cache=false
   ```

4. **Refresh Stock Universe**
   ```
   POST /api/gap-scanner
   {"action": "refresh-universe"}
   ```

## Files Modified
- `lib/stock-universe.ts` - New
- `app/api/gap-scanner/route.ts` - Updated
- `app/api/gap-scanner/test/route.ts` - New
- `cron-gap-scanner.yaml` - New
- `app/api/cron-status/route.ts` - Updated

## Branch
`feature/gap-scanner-5000`

## Deployment Notes
1. Ensure `FINNHUB_API_KEY` is set in environment
2. Ensure Redis is configured (`UPSTASH_REDIS_URL`)
3. First run will take ~10-15 min to build stock universe
4. Subsequent runs will use cached universe
5. Stock universe refreshes weekly or on-demand
