## Summary

Adds manual trade entry functionality to the calendar view, enabling users to record paper trades or trades from brokers that don't provide P&L data in exports.

## Features

### 1. Manual Trade Entry Modal
- Click any date on the calendar → opens modal with date pre-filled
- Form fields:
  - **Ticker symbol** - Stock/crypto ticker
  - **Entry price** - Trade entry price
  - **Exit price** (optional) - For closed trades
  - **Number of shares** - Position size
  - **Side** - Long/Short dropdown
  - **P&L amount** - Auto-calculates from prices or manual entry
  - **Date** - Pre-filled from clicked date, editable
  - **Notes** (optional) - Trade notes

### 2. Calendar Integration
- Hover over any calendar day to reveal '+' button for quick entry
- Click empty date → opens manual trade modal
- Click date with existing trades → shows day detail modal (unchanged)
- New 'Add Trade' button in header for manual entry

### 3. Data Storage
- API endpoint: `POST /api/trades/manual-add`
- Manual trades tagged with `'manual-entry'` for identification
- Integrates with existing Redis trade storage
- Works alongside existing import functionality

### 4. P&L Display
- Trades appear on calendar with green (profit) / red (loss) color coding
- Daily stats update to include manual trades

## Testing
- [ ] Click empty date on calendar → modal opens with date pre-filled
- [ ] Click '+' button on day → modal opens
- [ ] Fill form and save → trade appears on calendar
- [ ] Import functionality continues to work
- [ ] Both imported and manual trades display together

## Data Structure
```typescript
interface ManualTrade {
  id: string;
  ticker: string;
  entryPrice: number;
  exitPrice?: number;
  shares: number;
  side: 'LONG' | 'SHORT';
  pnl: number;
  date: string; // YYYY-MM-DD
  notes?: string;
  source: 'manual';
}
```

## Files Changed
- `components/trading/ManualTradeEntryModal.tsx` (new)
- `app/api/trades/manual-add/route.ts` (new)
- `components/trading/CalendarView.tsx` (modified)
