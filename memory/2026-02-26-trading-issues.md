# Trading Calculator Outstanding Issues — 2026-02-26

## Issues List (User Reported)

### 1. SHORT Profit Not Showing as Absolute Value
- **Location:** Active Trades profit display
- **Expected:** SHORT trade profit should show as positive number (absolute value)
- **Current:** May still be showing negative

### 2. Failed Trade Showing Positive Profit
- **Example:** Entry $6, LONG, Exit $5.90
- **Expected:** Profit = -$0.10 (negative, red)
- **Current:** Showing +$0.10 (positive)
- **Likely cause:** Profit calculation ignoring trade direction

### 3. Calendar File Upload Error
- **Location:** Calendar view file upload
- **Issue:** Throwing error on upload
- **Expected format:** Should accept Account Statement format (CSV from TOS)

### 4. No Manual Trade Entry in Calendar
- **Feature request:** Add ability to manually add trades directly in Calendar view
- **Current:** Only file upload available

### 5. Trade Persistence in Database
- **Status:** Migration to Redis in progress
- **Need:** Verify trades persist correctly after page refresh

### 6. Calendar Day Modal Not Showing Trades
- **Status:** SUPPOSEDLY fixed with DayDetailModal rewrite
- **Need:** Verify fix is working on deployed version
- **If still broken:** May be data fetching issue, not UI

## Action Items
- [ ] Spawn subagent for profit calculation fixes (#1, #2)
- [ ] Spawn subagent for calendar file upload fix (#3)
- [ ] Spawn subagent for manual trade entry feature (#4)
- [ ] Verify database persistence (#5)
- [ ] Test calendar day modal on deployed version (#6)

## Build Verification Protocol
ALL commits MUST pass `npm run build` before pushing.
