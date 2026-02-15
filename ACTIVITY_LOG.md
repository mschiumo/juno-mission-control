
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
