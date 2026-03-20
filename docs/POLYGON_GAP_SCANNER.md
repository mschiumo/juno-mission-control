# Polygon Gap Scanner Setup

## Step 1: Add your Polygon API Key

Edit `.env.local` and add:

```bash
POLYGON_API_KEY=your_polygon_api_key_here
```

Get your free API key at: https://polygon.io/dashboard/signup

## Step 2: Test the endpoint

```bash
# Test the new Polygon endpoint
curl http://localhost:3000/api/gap-scanner-polygon

# With custom filters
curl "http://localhost:3000/api/gap-scanner-polygon?minGap=5&minVolume=500000"
```

## Step 3: Update GapScannerCard (optional)

To use the Polygon endpoint instead of Finnhub, update `GapScannerCard.tsx`:

```typescript
// Change this line:
const response = await fetch('/api/gap-scanner');

// To:
const response = await fetch('/api/gap-scanner-polygon');
```

## Comparison

| Feature | Finnhub | Polygon |
|---------|---------|---------|
| API Calls | 5,000 (1 per stock) | 1 (all stocks) |
| Time | ~83 minutes | ~2 seconds |
| Rate Limit | 60/min | 5/min (free tier) |
| Market Cap | ✅ Yes | ❌ No |
| Stock Name | ✅ Yes | ❌ No |

## Notes

- Polygon free tier: 5 API calls/minute
- The endpoint caches results for 60 seconds
- Market cap data requires Polygon's "Stocks Advanced" plan
- You can keep both endpoints and switch between them
