## Summary

This PR introduces a comprehensive Position Calculator with Watchlist functionality, Active Trades management, and several trading UI enhancements.

## Features Added

### Position Calculator with Watchlist
- Position sizing calculator with risk-based share calculation
- Watchlist to track potential trades with entry, stop, and target prices
- Favorites system with star toggle for quick access
- Drag-and-drop reordering for watchlist items
- Real-time P&L preview and risk amount calculations

### Active Trades Management
- Active trades section with inline editing capabilities
- Edit modal for active trades with dynamic risk/reward calculation
- Auto-calculated shares based on risk amount and stop distance
- **Dynamic R/R ratio display** that updates as inputs change
- **Minimum 2:1 risk/reward validation** on save

### Closed Positions Enhancements
- Closed positions table with P&L tracking
- **Add to Calendar** functionality for closed positions
- Uses stored P&L from trading management (no fee recalculation)
- Removes position from closed list after adding to calendar

### CSV Import Improvements
- Added support for "Account Statement" and "Statement for" CSV formats
- Better format detection for TOS account statements

### UI/UX Improvements
- Formula explanations permanently visible (no toggle needed)
- Color-coded profit/loss displays
- Responsive card layouts
- Optimized drag-drop with no unnecessary API calls

## Commits
- 6e207d1 feat: add dynamic risk/reward ratio to EditActiveTradeModal
- 8b0a606 fix: use stored P&L from position when adding to calendar
- fbe2e4a cleanup: remove workspace files
- 0fe97e0 fix: add Account Statement support for CSV import
- 9fca4d8 fix: remove sort to enable drag-and-drop reordering
- a7dbb8f feat: auto-calculate shares in EditActiveTradeModal
- c09ed51 fix: remove leftover await code from favorite toggle
- 2cb5719 fix: star icon fill color - use fill-current
- cf7f7e8 perf: optimize drag-drop and favorites - no API calls
- 7a369b7 feat: add favorites and drag-and-drop to trading calculator
- 1b8ac98 cleanup: remove workspace setup files from PR
- fb92403 fix: restore API routes for watchlist, active-trades, closed-positions
- 950ae8a feat: Position Calculator with Watchlist and Active Trades
- 6e1e3cb ui: Remove info toggle, show formula explanations permanently

## Testing
- All components tested locally
- Drag-and-drop verified on desktop
- CSV import tested with various TOS formats
- Risk/reward calculation validated

## Deployment Notes
- No database migrations required
- Uses existing Redis storage
- Compatible with current API routes
