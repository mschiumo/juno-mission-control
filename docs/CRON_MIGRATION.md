# Cron Job Migration Analysis

## Overview

This document analyzes the current AI-dependent cron jobs and identifies which ones can be converted to API-based (no AI needed) and which ones should remain AI-powered (require reasoning/judgment).

## Migration Strategy

### Jobs to Convert to API-Based

These jobs perform data retrieval and formatting tasks that don't require AI reasoning or judgment. Converting them to API-based makes them faster, more reliable, and removes dependency on Juno.

| Job | Current Schedule | New Endpoint | Reason |
|-----|-----------------|--------------|--------|
| Daily Token Usage Summary | 11 PM daily | `/api/cron-jobs/token-usage` | Simple query + formatting |
| Market Close Report | 5:30 PM ET M-F | `/api/cron-jobs/market-close` | Fetch market data, format output |
| Gap Scanner | 8:30 AM ET M-F | `/api/cron-jobs/gap-scanner-trigger` | Trigger existing API |
| GitHub PR Monitor | Every 6 hours | `/api/cron-jobs/github-pr-monitor` | Check PRs, simple status |
| Evening Habit Check-in | 8 PM daily | `/api/cron-jobs/habit-checkin` | Static reminder message |
| Morning Market Briefing | 8 AM ET M-F | `/api/cron-jobs/market-briefing` | Fetch + format market data |

### Jobs to Keep as AI-Powered

These jobs require reasoning, analysis, or user interaction that benefits from AI capabilities.

| Job | Schedule | Endpoint | Reason |
|-----|----------|----------|--------|
| Nightly Goals Audit | 10 PM daily | Keep as AI | Needs goal analysis, pattern recognition |
| Task Approval Request | Daily | Keep as AI | Requires user interaction, negotiation |
| Trading Analysis/Insights | As needed | Keep as AI | Needs interpretation of market data |

## API-Based Job Details

### 1. Token Usage Summary
**Purpose:** Generate daily token usage report
**Implementation:**
- Query session data from Redis
- Calculate daily usage statistics
- Format as markdown report
- POST to `/api/cron-results`
- Send Telegram notification if usage is significant

### 2. Market Close Report
**Purpose:** Fetch end-of-day market data
**Implementation:**
- Fetch SPY, QQQ, VIX prices from market API
- Calculate daily changes
- Format market summary
- POST to `/api/cron-results`

### 3. Gap Scanner Trigger
**Purpose:** Trigger the gap scanner
**Implementation:**
- POST to existing `/api/gap-scanner` endpoint
- Wait for completion
- POST results to `/api/cron-results`

### 4. GitHub PR Monitor
**Purpose:** Check for open PRs and mentions
**Implementation:**
- Query GitHub API for open PRs
- Check for review requests/mentions
- Alert only if actionable items found
- POST status to `/api/cron-results`

### 5. Evening Habit Check-in
**Purpose:** Send evening habit reminder
**Implementation:**
- Static message (no AI generation)
- Include link to dashboard
- POST to `/api/cron-results`

### 6. Morning Market Briefing
**Purpose:** Fetch and format morning market data
**Implementation:**
- Fetch market data for indices and key stocks
- Format as brief summary
- POST to `/api/cron-results`

## Helper Utilities

### `lib/cron-helpers.ts`

Common utilities for API-based cron jobs:

```typescript
// Post results to cron-results endpoint
async function postToCronResults(jobName: string, content: string, type?: string)

// Send Telegram notification if needed
async function sendTelegramIfNeeded(message: string, condition?: boolean)

// Log to activity log
async function logToActivityLog(action: string, details: string, type?: string)
```

## New Cron Configuration

The new `cron-api-based.yaml` file defines schedules for API-based jobs:

```yaml
crons:
  - name: "API-Daily Token Usage"
    schedule: "0 23 * * *"  # 11 PM daily
    endpoint: "/api/cron-jobs/token-usage"
    
  - name: "API-Market Close Report"
    schedule: "30 21 * * 1-5"  # 5:30 PM ET M-F
    endpoint: "/api/cron-jobs/market-close"
    
  - name: "API-Gap Scanner"
    schedule: "30 13 * * 1-5"  # 8:30 AM ET M-F
    endpoint: "/api/cron-jobs/gap-scanner-trigger"
    
  - name: "API-GitHub PR Check"
    schedule: "0 */6 * * *"  # Every 6 hours
    endpoint: "/api/cron-jobs/github-pr-monitor"
    
  - name: "API-Evening Habit Check-in"
    schedule: "0 20 * * *"  # 8 PM daily
    endpoint: "/api/cron-jobs/habit-checkin"
```

## Testing Instructions

1. **Manual Testing:**
   ```bash
   # Test token usage endpoint
   curl http://localhost:3000/api/cron-jobs/token-usage
   
   # Test market close endpoint
   curl http://localhost:3000/api/cron-jobs/market-close
   
   # Test habit checkin endpoint
   curl http://localhost:3000/api/cron-jobs/habit-checkin
   ```

2. **Verify Results:**
   - Check `/api/cron-results` for stored results
   - Check Activity Log for logged actions
   - Check Telegram for notifications (if applicable)

3. **Cron Schedule Testing:**
   - Temporarily change schedules to run in near future
   - Verify endpoints are called at correct times
   - Monitor logs for errors

## Rollback Plan

If issues arise:
1. Disable API-based cron jobs in `cron-api-based.yaml`
2. Re-enable original AI-based cron jobs
3. Fix issues and redeploy

## Benefits

1. **Faster execution** - No AI model initialization time
2. **Lower costs** - No AI API calls for simple tasks
3. **Higher reliability** - No dependency on AI model availability
4. **Simpler debugging** - Straightforward API calls vs AI reasoning
5. **Consistent output** - Deterministic formatting
