# Fix Daily Motivational Message Cron Job

## Summary

This PR fixes the Daily Motivational Message cron job to ensure it:
1. **Posts different quotes each day** (date-based deterministic selection)
2. **Doesn't timeout** (60s limit was too short)
3. **Properly reports to dashboard** (POST to /api/cron-results works correctly)

## Changes Made

### 1. New API Endpoint: `/api/cron/daily-motivational`
- **GET**: Returns today's quote without sending (for preview/testing)
- **POST**: Sends the message via Telegram and logs results
- **Features**:
  - 30 quotes for daily variety throughout the month/year
  - Deterministic selection: same date = same quote (consistency)
  - Direct Telegram API integration
  - Automatic POST to `/api/cron-results`
  - Automatic logging to `/api/activity-log`
  - Error handling and reporting

### 2. Date-Based Quote Selection
```typescript
// Uses day of year for variety within the year
const dayOfYear = Math.floor((date.getTime() - startOfYear.getTime()) / (1000 * 60 * 60 * 24));
const index = dayOfYear % QUOTES.length; // 30 quotes total
```
- Ensures different quotes each day
- Same date always returns same quote (deterministic)
- 30 quotes provide variety throughout the year

### 3. Vercel Configuration (`vercel.json`)
```json
{
  "functions": {
    "app/api/cron/daily-motivational/route.ts": {
      "maxDuration": 60
    }
  }
}
```
- Increases function timeout to 60 seconds
- Prevents timeouts during Telegram API calls

### 4. Updated Cron-Status Endpoint
- Added "Daily Motivational Message" to the cron jobs list
- Added job name mapping for result tracking
- Now appears in dashboard status checks

### 5. Updated YAML Configuration
- Added API-based approach as primary method
- Reduced AI fallback timeout to 60s
- Added explicit timeout configuration

## API Usage

### Get Today's Quote (Preview)
```bash
GET /api/cron/daily-motivational
```

Response:
```json
{
  "success": true,
  "data": {
    "quote": {
      "text": "The future belongs to those who believe in the beauty of their dreams.",
      "author": "Eleanor Roosevelt",
      "index": 0
    },
    "message": "Good morning! ☀️\n\n\"The future belongs...\" — Eleanor Roosevelt\n\nMake today count! 💪",
    "quoteIndex": 0,
    "totalQuotes": 30
  }
}
```

### Send Daily Message
```bash
POST /api/cron/daily-motivational
```

Response:
```json
{
  "success": true,
  "data": {
    "quote": { ... },
    "telegramSent": true,
    "durationMs": 850,
    "timestamp": "2026-02-21T22:50:00.000Z"
  }
}
```

## Testing

1. **Preview today's quote**:
   ```bash
   curl https://juno-mission-control.vercel.app/api/cron/daily-motivational
   ```

2. **Test sending** (use with caution - sends real message):
   ```bash
   curl -X POST https://juno-mission-control.vercel.app/api/cron/daily-motivational
   ```

3. **Check cron status**:
   ```bash
   curl https://juno-mission-control.vercel.app/api/cron-status
   ```

4. **View recent results**:
   ```bash
   curl https://juno-mission-control.vercel.app/api/cron-results
   ```

## Environment Variables Required

- `TELEGRAM_BOT_TOKEN` - Bot token for Telegram API
- `TELEGRAM_CHAT_ID` - Chat ID to send messages to
- `UPSTASH_REDIS_URL` or `REDIS_URL` - For storing results and activity logs

## Expected Behavior

| Before | After |
|--------|-------|
| Random quote selection | Deterministic date-based selection |
| 60s timeout causing failures | 60s function timeout + 30s API timeout |
| Silent POST failures | Explicit error handling and logging |
| Not visible in cron-status | Visible and tracked in cron-status |
| AI-dependent execution | Direct API execution |

## Files Changed

- `app/api/cron/daily-motivational/route.ts` (NEW)
- `app/api/cron-status/route.ts` (UPDATED)
- `vercel.json` (NEW)
- `cron-daily-motivational.yaml` (UPDATED)
- `juno-dashboard/cron-daily-motivational.yaml` (UPDATED)
