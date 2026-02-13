# Dashboard Report Integration

## Overview
All cron job reports should be sent to the dashboard via the `/api/cron-results` endpoint. This allows MJ to view reports in the Daily Reports section of Juno Mission Control.

## API Endpoint

**POST** `https://juno-mission-control.vercel.app/api/cron-results`

### Request Body
```json
{
  "jobName": "Morning Market Briefing",
  "content": "📊 **Morning Market Briefing**\n\nSPX: 6,125 (+0.8%)...",
  "type": "market"
}
```

### Fields
- `jobName` (required): Name of the cron job (must match cron job name)
- `content` (required): Full report content (markdown supported)
- `type` (optional): Type of report
  - `market` - Market data/reports
  - `motivational` - Quotes, inspiration
  - `check-in` - Habit/trading checks
  - `review` - End-of-day reviews

### Example cURL
```bash
curl -X POST https://juno-mission-control.vercel.app/api/cron-results \
  -H "Content-Type: application/json" \
  -d '{
    "jobName": "Morning Market Briefing",
    "content": "📊 **Morning Market Briefing**\n\nSPX: 6,125 (+0.8%)...",
    "type": "market"
  }'
```

## Cron Job Pattern

When a cron job runs, it should:

1. **Generate the report content**
2. **POST to dashboard** via `/api/cron-results`
3. **Then send to Telegram** (optional, for immediate notification)

Example flow:
```
Cron Job Triggers
    ↓
Generate Report Content
    ↓
POST to /api/cron-results
    ↓
Send Telegram message (optional)
```

## Report Formatting

Use markdown for formatting:
- `**bold**` for emphasis
- `•` bullets for lists
- `🚀 📊 💪` emojis for visual interest
- Headers with `##` for sections

## Current Jobs Sending to Dashboard

| Job | Type | Schedule |
|-----|------|----------|
| Morning Market Briefing | market | 8:00 AM EST |
| Daily Motivational | motivational | 7:00 AM EST |
| Mid-Day Trading Check | check-in | 12:30 PM EST |
| Post-Market Trading Review | review | 5:00 PM EST |
| Market Close Report | market | 5:00 PM EST |
| Evening Habit Check | check-in | 8:00 PM EST |
| Daily Token Usage Summary | review | 11:00 PM EST |

## Implementation Notes

- Reports are stored in-memory (resets on deploy)
- For production, use a database (Redis, PostgreSQL, etc.)
- Dashboard auto-refreshes every 30 seconds
- Reports older than 24 hours are filtered out
