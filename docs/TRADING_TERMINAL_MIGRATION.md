# Trading Terminal Production Migration Plan

## Phase 1: Remove Non-Trading Components

### Components to DELETE:
- [ ] CalendarCard.tsx
- [ ] GoalsCard.tsx  
- [ ] DailyJournalCard.tsx
- [ ] HabitsCard.tsx
- [ ] Gmail integration components
- [ ] DocumentationCard.tsx (or simplify)
- [ ] Non-trading parts of CombinedCalendarView.tsx

### API Routes to DELETE:
- [ ] app/api/habits/*
- [ ] app/api/calendar-events/*
- [ ] app/api/gmail/*
- [ ] app/api/daily-journal/*
- [ ] app/api/goals/*

### Lib files to DELETE:
- [ ] lib/habits.ts
- [ ] lib/calendar.ts
- [ ] lib/gmail.ts
- [ ] lib/journal.ts

### Types to simplify:
- [ ] types/index.ts - remove habit, calendar, goal types

## Phase 2: Trading Features to KEEP/ENHANCE

### Core Trading Components:
- [x] GapScannerCard.tsx
- [x] MarketCard.tsx
- [x] PositionCalculator
- [x] TradeManagementView
- [x] QuickWatchlist
- [x] WatchlistView
- [x] DailyPnL
- [x] ActiveTradesView

### Trading API Routes:
- [x] /api/gap-scanner
- [x] /api/gap-scanner-polygon
- [x] /api/premarket
- [x] /api/watchlist
- [x] /api/active-trades
- [x] /api/symbols/search
- [x] /api/trades/*

## Phase 3: Production Infrastructure

### Database Schema (New):
```sql
-- Users table (for external users)
users (id, email, created_at, subscription_tier)

-- User trades (isolated per user)
trades (id, user_id, ticker, entry_price, ...)
watchlist (id, user_id, ticker, ...)

-- System data (shared)
stock_universe
gap_scanner_cache
```

### Authentication:
- [ ] Add NextAuth.js or Clerk
- [ ] Login/Register pages
- [ ] Protected routes middleware

### Environment Variables (Production):
```
# Database
DATABASE_URL=postgresql://...
REDIS_URL=...

# APIs
POLYGON_API_KEY=
FINNHUB_API_KEY=

# Auth
NEXTAUTH_SECRET=
NEXTAUTH_URL=

# App
NEXT_PUBLIC_APP_URL=
```

## Phase 4: Clean Up

### package.json:
- Remove: calendar libs, habit tracking libs, gmail libs
- Keep: trading libs, charts, UI libs

### Navigation:
- Simplify to: Dashboard, Market, Trade Management
- Remove: Calendar, Goals, Habits, Journal tabs

### Page Structure:
- / (dashboard) - trading overview
- /market - gap scanner + market data
- /trade-management - position calculator + watchlist

## Phase 5: Deployment Prep

### Vercel Config:
- Environment variables
- Build settings
- Domain config

### Security:
- Rate limiting
- CORS settings
- API key protection

### Monitoring:
- Error tracking (Sentry)
- Analytics (optional)

---

## Current Status:
- [ ] Phase 1 in progress
- [ ] Phase 2 complete
- [ ] Phase 3 pending
- [ ] Phase 4 pending
- [ ] Phase 5 pending
