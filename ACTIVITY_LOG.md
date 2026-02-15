
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
