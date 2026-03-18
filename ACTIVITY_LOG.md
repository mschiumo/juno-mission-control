
[2026-02-19T17:30:00Z] FIX: Resolved TypeScript errors in PR #132 (API-Based Crons)
- Fixed TypeScript enum assignment errors in trades API:
  - app/api/trades/import/route.ts(252): Strategy.OTHER instead of 'OTHER' string
  - app/api/trades/import/route.ts(265): TradeStatus.CLOSED instead of 'CLOSED' string
  - app/api/trades/route.ts(192): Added userId property to CreateTradeRequest interface
  - app/api/trades/route.ts(195): TradeStatus.OPEN instead of 'OPEN' string
- Changed imports from `import type` to regular imports for Strategy and TradeStatus enums
- Enums are runtime values, not just types - must be imported as values to use as defaults
- Branch: feat/api-based-crons
- Commit: 949e83a

[2026-02-19T17:29:00Z] FEATURE: Added $AERO and $VIRTUALS to crypto tab
- Added Aerodrome Finance (AERO) and Virtuals Protocol (VIRTUALS) to CoinGecko fetch
- Updated fallback data with both tokens
- CoinGecko IDs: aerodrome-finance, virtuals-protocol
- Committed and pushed to feat/tradervue-trading-journal branch

[2026-02-19T16:45:00Z] SYSTEM: Created API-based cron jobs feature branch (AI-Independent)
- Created docs/CRON_MIGRATION.md with analysis of which crons to convert
  - Convert to API: Token Usage, Market Close, Gap Scanner, GitHub PR, Habit Check-in, Market Briefing
  - Keep as AI: Goals Audit, Task Approval, Trading Analysis (need reasoning)
- Created lib/cron-helpers.ts with common utilities:
  - postToCronResults() - Store job results in Redis
  - sendTelegramIfNeeded() - Conditional Telegram notifications
  - logToActivityLog() - Execution history tracking
  - Helper functions for date formatting and market checks
- Created 6 API-based cron job endpoints (no AI dependency):
  - /api/cron-jobs/token-usage - Daily token usage reports from Redis
  - /api/cron-jobs/market-close - SPY, QQQ, VIX end-of-day data
  - /api/cron-jobs/market-briefing - Morning indices + key stocks + crypto
  - /api/cron-jobs/github-pr-monitor - Open PRs and review requests
  - /api/cron-jobs/gap-scanner-trigger - Triggers existing gap scanner
  - /api/cron-jobs/habit-checkin - Evening habit reminder (static)
- Created cron-api-based.yaml with new schedules:
  - Token Usage: 11 PM daily
  - Market Close: 5:30 PM ET M-F
  - Gap Scanner: 8:30 AM ET M-F
  - GitHub PR Check: Every 6 hours
  - Habit Check-in: 8 PM daily
  - Market Briefing: 8 AM ET M-F
- All endpoints post results to /api/cron-results and log to Activity Log
- Telegram notifications sent conditionally (significant events only)
- Branch: feat/api-based-crons
- PR: https://github.com/mschiumo/juno-mission-control/pull/new/feat/api-based-crons

[2026-02-19T02:00:00Z] SYSTEM: Updated Gap Scanner for 5000 stocks, $100M+ market cap, 8:30 AM schedule
- Scales from 50 stocks to 5000 (100x increase)
- Filters by market cap > $100M (previously no filtering)
- Schedule changed from 7:30 AM to 8:30 AM EST
- Implemented batch polling (50 stocks per minute, 1s delay)
- Created lib/stock-universe.ts for stock list management
  - Fetches NYSE + NASDAQ stocks from Finnhub
  - Filters by market cap, sorts by market cap descending
  - Stores top 5000 in Redis with 7-day TTL
  - Fallback to 100 liquid stocks if Redis unavailable
- Rewrote app/api/gap-scanner/route.ts with batch processing
  - 1 API call per second (60/min) - within Finnhub free tier
  - Total scan time: ~100 seconds for 5000 stocks
  - Caches results for the day in Redis
  - Query params: dryRun, limit, refresh, cache, minGap
- Created app/api/gap-scanner/test/route.ts for testing
  - Test with limited stock count: GET /api/gap-scanner/test?stocks=100
  - API validation: POST {action: "validate-api"}
  - Rate limit check: POST {action: "rate-limit-check"}
- Created cron-gap-scanner.yaml with 8:30 AM EST schedule
- Updated app/api/cron-status/route.ts schedule display
- API usage: ~100 calls, ~100 seconds total
- Testing: dryRun mode, small batch tests, full 5000 test
- Documentation: docs/GAP_SCANNER_5000.md
- Branch: feature/gap-scanner-5000
- PR: https://github.com/mschiumo/juno-mission-control/pull/new/feature/gap-scanner-5000

[2026-02-15T22:35:00Z] SYSTEM: Added notification banners for goal operations with undo
- Added notification state and helper functions (showNotification, dismissNotification)
- Created notification banner UI with 3 types: success (green), error (red), undo (orange)
- Updated deleteGoal() to optimistically remove and show undo banner with stored goal
- Implemented undoDelete() to restore goals via API with original ID preserved
- Added success notifications for: addGoal, saveNotes, moveGoal, moveCategory, toggleJunoAssisted
- Added error notifications for all operation failures
- Updated PUT /api/goals to accept optional id, phase, junoAssisted, actionItems for restore
- Auto-dismiss success/error after 5s; undo stays until dismissed or acted upon
- Icons: Check (success), AlertCircle (error), RotateCcw (undo)
- Branch: feature/goal-notifications-undo
- PR: https://github.com/mschiumo/juno-mission-control/pull/new/feature/goal-notifications-undo
- Added useIsMobile hook to detect mobile viewport (< 640px)
- Added truncateForMobile utility to show first word only on mobile
- Truncated habit names in Daily Check-in and Stats & Reports tabs
- Hide Yes/No button text on mobile, show icons only
- Added tooltip to show full habit name on hover in Stats tab
- Build passes ✓
- PR: https://github.com/mschiumo/juno-mission-control/pull/99

[2026-02-15T19:45:00Z] SYSTEM: Restored Strava integration with proper token persistence
- Fixed critical bug: Strava returns NEW refresh token on every exchange
- Implemented Redis-based token storage (lib/strava-auth.ts)
- Added automatic token refresh with 5-minute expiry buffer
- Created API endpoint (app/api/strava-activities/route.ts)
- Built UI component (components/StravaCard.tsx) with orange/black theme
- Added comprehensive documentation (docs/STRAVA_INTEGRATION.md)
- PR: https://github.com/mschiumo/juno-mission-control/pull/90

[2026-02-15T13:10:00Z] SYSTEM: Fixed crypto TradingView links in MarketCard.tsx
- Added getTradingViewSymbol() helper function
- Crypto symbols now formatted as COINBASE:SYMBOLUSD (spot price)
- Indices/stocks/commodities keep existing behavior
- PR: https://github.com/mschiumo/juno-mission-control/pull/new/fix/crypto-tradingview-links
