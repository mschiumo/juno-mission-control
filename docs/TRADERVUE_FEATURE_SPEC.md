# TraderVue Clone - Trading Journal Feature Spec

**Status:** Collaborative Goal - Ready for Implementation  
**Created:** 2026-02-19 by MJ  
**Juno Assisted:** Yes  
**Location:** Trading Tab

---

## Overview

Build a TraderVue-style trading journal directly into the Juno Mission Control dashboard. Replace the need for external Tradervue subscription with a native, integrated solution.

**TraderVue Reference:** https://www.tradervue.com/

---

## Core Features to Replicate

### 1. Trade Entry & Management
- **Manual trade entry form:**
  - Symbol/ticker
  - Side (long/short)
  - Entry price & exit price
  - Number of shares/contracts
  - Entry time & exit time
  - P&L (auto-calculated)
  - Fees/commissions
  - Net P&L
- **Trade tagging:**
  - Strategy (breakout, pullback, gap, etc.)
  - Setup type
  - Emotions (FOMO, fear, greed, confidence)
  - Mistakes made
- **Notes per trade:**
  - What worked
  - What didn't
  - Lessons learned
- **Chart annotations:**
  - Entry/exit marks on price charts
  - Screenshot uploads

### 2. Dashboard Overview
- **P&L Summary Cards:**
  - Today
  - This week
  - This month
  - Year-to-date
- **Key Metrics:**
  - Win rate (%)
  - Average winner
  - Average loser
  - Profit factor
  - Sharpe ratio
  - Max drawdown
- **Recent Trades List:**
  - Sortable (date, P&L, symbol)
  - Filterable (strategy, date range)
  - Quick view/edit

### 3. Analytics & Reports
- **Performance by:**
  - Day of week (Mon-Sun performance)
  - Time of day (hourly breakdown)
  - Symbol (which tickers are profitable)
  - Strategy (which setups work)
  - Month/quarter/year
- **Exit Performance:**
  - How much profit left on table
  - Early exits vs optimal exits
  - Emotional exit analysis
- **Risk Analysis:**
  - Max drawdown
  - Consecutive losses
  - Risk/reward by trade type

### 4. Visualizations
- **P&L Charts:**
  - Running P&L (equity curve)
  - Daily P&L candles
  - Cumulative returns
- **Trade Distribution:**
  - Win/loss ratio pie chart
  - P&L histogram
- **Performance Over Time:**
  - Equity curve
  - Drawdown periods

### 5. Calendar View
- **Trade Calendar:**
  - Monthly grid view
  - Days with trades highlighted
  - Daily P&L color-coded (green/red)
- **Click to View:**
  - Day's trades detail
  - Daily summary stats
  - Journal entry for that day

### 6. Journal/Notes
- **Daily Journal:**
  - Thoughts and observations
  - Market conditions
  - Mental state
  - Goals for tomorrow
- **Trade-Specific Notes:**
  - Per-trade reflections
  - Screenshot uploads
  - Chart markup
- **Tags & Search:**
  - Find trades by criteria
  - Filter by tag
  - Full-text search

---

## Implementation Phases

### Phase 1: Database & API (Week 1)

**Database Schema:**

```sql
-- trades table
trades:
  id: uuid (primary key)
  user_id: string
  symbol: string
  side: enum('long', 'short')
  entry_price: decimal
  exit_price: decimal
  shares: integer
  entry_time: timestamp
  exit_time: timestamp
  pnl: decimal (calculated)
  fees: decimal
  net_pnl: decimal
  strategy: string
  setup_type: string
  tags: string[]
  emotions: string
  mistakes: string
  notes: text
  screenshots: string[]
  chart_url: string
  created_at: timestamp
  updated_at: timestamp

-- trade_journal table
trade_journal:
  id: uuid
  trade_id: uuid (foreign key)
  entry_notes: text
  exit_notes: text
  lessons: text
  mental_state: string
  market_conditions: string

-- daily_summary table
daily_summary:
  date: date (primary key)
  user_id: string
  total_pnl: decimal
  num_trades: integer
  win_count: integer
  loss_count: integer
  best_trade: decimal
  worst_trade: decimal
  journal_entry: text

-- metrics_cache table (for performance)
metrics_cache:
  user_id: string
  timeframe: string
  win_rate: decimal
  avg_winner: decimal
  avg_loser: decimal
  profit_factor: decimal
  sharpe_ratio: decimal
  last_updated: timestamp
```

**API Endpoints:**

```
POST   /api/trades              - Create new trade
GET    /api/trades              - List trades (with filters)
GET    /api/trades/:id          - Get single trade
PUT    /api/trades/:id          - Update trade
DELETE /api/trades/:id          - Delete trade
POST   /api/trades/bulk         - Bulk import trades

GET    /api/trades/stats        - Get statistics
GET    /api/trades/reports/:type - Generate reports (day, time, symbol, strategy)
GET    /api/trades/calendar     - Get calendar data

POST   /api/trades/journal      - Add journal entry
PUT    /api/trades/journal/:id  - Update journal entry

POST   /api/trades/import       - Import from CSV
GET    /api/trades/export       - Export to CSV
```

### Phase 2: UI Components (Week 2-3)

**Trading Tab Restructure:**

```
/trading (tab)
├── Overview (new default)
│   ├── P&L Summary Cards
│   ├── Win Rate Display
│   ├── Key Metrics Grid
│   └── Recent Trades Table
├── Trades
│   ├── Filter Bar
│   ├── Sortable Table
│   └── Add Trade Button
├── Analytics
│   ├── Performance by Day
│   ├── Performance by Time
│   ├── Symbol Performance
│   └── Strategy Performance
├── Calendar
│   ├── Monthly View
│   ├── Daily Detail
│   └── Spreadsheet Import (drag-drop CSV/Excel)
└── Journal
    ├── Daily Journal
    └── Trade Notes
```

**Components to Build:**

1. **TradeEntryModal**
   - Form with all trade fields
   - Auto-calculate P&L
   - Tag selector
   - Emotion picker

2. **TradeTable**
   - Sortable columns
   - Inline editing
   - Bulk actions
   - Pagination

3. **DashboardStats**
   - P&L cards (today/week/month/YTD)
   - Win rate display
   - Metric tiles

4. **PerformanceChart**
   - Equity curve
   - P&L over time
   - Interactive tooltips

5. **AnalyticsView**
   - Day of week chart
   - Hourly performance
   - Symbol breakdown
   - Strategy comparison

6. **CalendarView**
   - Monthly grid
   - Color-coded days
   - Day detail modal

7. **JournalEditor**
   - Rich text editor
   - Screenshot upload
   - Tag input

8. **SpreadsheetImportModal**
   - Drag-and-drop CSV/Excel upload
   - Column mapping (match spreadsheet columns to trade fields)
   - Preview before import
   - Validation and error handling
   - Populate calendar with imported trades

### Phase 3: Charts & Visualizations (Week 3-4)

**Chart Library:** Recharts (already in project)

**Charts Needed:**

1. **Equity Curve**
   - Line chart
   - Account balance over time
   - Start/end markers

2. **P&L Distribution**
   - Histogram
   - Trade outcomes
   - Average line

3. **Win/Loss by Day**
   - Bar chart
   - Monday-Sunday
   - Win % per day

4. **Win/Loss by Hour**
   - Bar chart
   - 9:30 AM - 4:00 PM
   - Best/worst hours

5. **Strategy Performance**
   - Bar chart
   - Net P&L by strategy
   - Win rate by strategy

6. **Trade Duration Scatter**
   - X: Duration (minutes)
   - Y: P&L
   - Color: Win/Loss

### Phase 4: Import/Export (Week 4)

**CSV Import:**
- Template download
- Broker format support (TOS, IBKR, etc.)
- Validation & error handling
- Duplicate detection

**CSV Export:**
- All trades export
- Date range filter
- Custom columns

### Spreadsheet Calendar Import (Key Feature)

**Drag-and-Drop Interface:**
- CSV/Excel file upload zone in Calendar view
- Support for .csv, .xlsx files
- Template download for correct format

**Column Mapping:**
- Auto-detect common column names (Symbol, Entry, Exit, etc.)
- Manual mapping for custom formats
- Save mapping profiles for future imports

**Data Preview:**
- Show first 10 rows before import
- Highlight errors/warnings
- Option to skip or fix problematic rows

**Calendar Population:**
- Import populates both trades AND calendar days
- Auto-calculate daily P&L totals
- Color-code days based on imported results

**Supported Formats:**
- ThinkOrSwim export
- Interactive Brokers
- Generic CSV (template provided)
- Manual spreadsheet entry

### Phase 5: Advanced Features (Future)

- **Auto-import from brokers:** API integrations
- **TradingView charts:** Embedded charts with marks
- **Screenshot uploads:** Cloud storage
- **Trade sharing:** Anonymized comparison
- **AI analysis:** Juno-powered insights
- **Mobile app:** React Native version

---

## UI/UX Design

### Theme
- **Dark mode:** Match existing dashboard
- **Colors:**
  - Green (#22c55e): Profits, wins, positive
  - Red (#ef4444): Losses, negative
  - Orange (#F97316): Accent, highlights
  - Grays: Backgrounds, borders

### Layout
- **Sidebar:** Trading sub-tabs
- **Main area:** Charts, tables, forms
- **Modals:** Trade entry, detail views
- **Responsive:** Mobile-first design

### Key Interactions
- **One-click trade entry:** Quick add button
- **Inline editing:** Edit trades in table
- **Drill-down:** Click chart → see trades
- **Keyboard shortcuts:** Power user features

---

## Acceptance Criteria

- [ ] User can add/edit/delete trades
- [ ] Dashboard shows P&L, win rate, key metrics
- [ ] Can view trades by day/week/month
- [ ] Analytics show performance by day/time/symbol/strategy
- [ ] Calendar view with color-coded daily P&L
- [ ] Can add journal notes to trades and days
- [ ] All data persists in database
- [ ] CSV import/export works
- [ ] Mobile responsive
- [ ] Matches dashboard design system

---

## Technical Stack

- **Frontend:** Next.js 14, React, TypeScript
- **Styling:** Tailwind CSS
- **Charts:** Recharts
- **State:** React Query ( TanStack Query )
- **Forms:** React Hook Form
- **Database:** PostgreSQL (trades), Redis (cache)
- **File Uploads:** Vercel Blob
- **Auth:** Existing auth system

---

## Estimated Timeline

| Phase | Duration | Deliverables |
|-------|----------|--------------|
| Phase 1 | 1 week | Database schema, API endpoints |
| Phase 2 | 2 weeks | UI components, Trading tab restructure |
| Phase 3 | 1 week | Charts, visualizations |
| Phase 4 | 1 week | Import/export |
| **Total** | **5 weeks** | Full TraderVue clone |

---

## Related Documentation

- [Trading Rules](./TRADING_RULES.md)
- Current Trading Tab: `app/(dashboard)/trading/page.tsx`
- Database: PostgreSQL schema in Vercel

---

## Priority

**HIGH** - Core trading infrastructure  
Replaces $30-50/month Tradervue subscription with native solution.

---

## Next Steps

1. Review and approve feature spec
2. Create database migrations
3. Start Phase 1 (API development)
4. Weekly check-ins on progress

---

*Last Updated: 2026-02-19*  
*Created by: MJ*  
*Juno Assisted: Full implementation support*
