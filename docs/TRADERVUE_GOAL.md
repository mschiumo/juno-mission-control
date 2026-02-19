# TraderVue Clone - Collaborative Goal

**ID:** c-tradervue-2026-02-19  
**Title:** Build TraderVue Clone - Internal Trading Journal  
**Category:** Collaborative  
**Phase:** Not Started  
**Juno Assisted:** Yes  
**Created:** 2026-02-19 15:46 UTC

---

## Goal: Build TraderVue-Style Trading Journal Internally

**NOT just connecting to Tradervue** — Full internal build in Trading tab

---

## Key Features

### 1. Trade Entry & Management
- Manual trade form (symbol, entry/exit, P&L, fees)
- Trade tagging (strategy, emotions, mistakes)
- Notes per trade
- Chart annotations with screenshots

### 2. Dashboard Overview
- P&L Summary (today/week/month/YTD)
- Win rate, avg winner/loser, Sharpe ratio
- Recent trades table

### 3. Analytics & Reports
- Performance by day of week, time of day
- Symbol performance (which tickers work)
- Strategy performance
- Exit analysis (profit left on table)

### 4. Visualizations
- Equity curve
- P&L distribution
- Win/loss by day/hour charts

### 5. Calendar View
- Monthly grid with daily P&L coloring
- Click day to see trades
- **SPREADSHEET IMPORT:** Drag-drop CSV/Excel to populate calendar

### 6. Journal/Notes
- Daily journal entries
- Trade-specific reflections
- Tags & search

---

## Spreadsheet Calendar Import (Key Feature)

**Drag-and-Drop Interface:**
- Upload CSV/Excel in Calendar view
- Support TOS, IBKR, generic formats
- Column mapping (auto-detect + manual)
- Preview before import
- Populates calendar days with color-coding
- Template download for manual entry

**Supported Formats:**
- ThinkOrSwim export
- Interactive Brokers
- Generic CSV (template provided)
- Manual spreadsheet entry

---

## Timeline: 5 Weeks

**Phase 1:** Database & API (Week 1)  
**Phase 2:** UI Components (Week 2-3)  
**Phase 3:** Charts (Week 3-4)  
**Phase 4:** Import/Export + Spreadsheet Calendar (Week 4)  
**Phase 5:** Polish & Advanced (Week 5)

---

## Documentation

- Full spec: `docs/TRADERVUE_FEATURE_SPEC.md`
- Trading Rules: `docs/TRADING_RULES.md`

---

## Acceptance Criteria

- [ ] Add/edit/delete trades
- [ ] Dashboard with key metrics
- [ ] Calendar view with spreadsheet import
- [ ] Analytics by day/time/symbol/strategy
- [ ] CSV import/export
- [ ] Mobile responsive

---

## Priority

**HIGH** — Replaces $30-50/mo Tradervue subscription  
**Location:** Trading Tab

---

## Action Items

- [ ] Review and approve feature spec
- [ ] Create database migrations
- [ ] Start Phase 1 (API development)
- [ ] Weekly check-ins on progress

---

*Last Updated: 2026-02-19*  
*Created by: MJ*  
*Juno Assisted: Full implementation support*
