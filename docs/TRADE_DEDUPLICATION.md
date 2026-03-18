# Trade Deduplication Feature

This feature detects and merges duplicate trades between dashboard entries and TOS CSV imports.

## Problem

Users enter trades manually in the dashboard during the day (with notes). Later, they import TOS CSV files with the same trades, which currently creates duplicates.

## Solution

The system now detects potential duplicates during CSV import and allows users to review and merge them.

## How It Works

### 1. Duplicate Detection

When importing a CSV file:
- The system compares CSV trades against existing dashboard trades
- Matches are found using: **Symbol + Date + PnL (within ±$2.00 tolerance)**
- Confidence level is calculated based on match quality

### 2. Review Modal

If potential duplicates are found, a review modal appears showing:
- **Left side**: Dashboard trade (with your notes)
- **Right side**: CSV trade (from brokerage - more accurate)
- **Match confidence**: High/Medium/Low with reasons

### 3. Actions

For each potential duplicate, you can:
- ✅ **Merge**: Keep CSV data as primary, preserve your notes, delete dashboard entry
- 🔵 **Keep Both**: Save CSV trade as separate entry
- ⚪ **Review Later**: Skip this trade for now

Bulk actions:
- **Merge All**: Merge all selected duplicates
- **Keep All**: Import all selected as separate trades

### 4. Merge Logic

When merging:
- CSV data is used as the primary source (more accurate from brokerage)
- Your dashboard notes are preserved and combined
- The trade is marked as `isMerged: true`
- Original dashboard trade is deleted

## Files Added/Modified

### New Files
- `lib/trading/duplicate-detection.ts` - Core duplicate detection logic
- `components/trading/DuplicateReviewModal.tsx` - Review UI component
- `hooks/useDuplicateReview.ts` - React hook for managing the flow
- `app/api/trades/import/merge/route.ts` - Merge endpoint

### Modified Files
- `types/trading.ts` - Added duplicate detection types
- `app/api/trades/import/route.ts` - Added duplicate detection to import

## Usage Example

```tsx
import { useDuplicateReview } from '@/hooks/useDuplicateReview';
import DuplicateReviewModal from '@/components/trading/DuplicateReviewModal';

function MyComponent() {
  const {
    isImporting,
    showDuplicateModal,
    potentialDuplicates,
    newTrades,
    importStats,
    importCSV,
    handleMerge,
    handleKeepBoth,
    handleSkip,
    handleMergeAll,
    handleKeepAll,
    closeDuplicateModal,
  } = useDuplicateReview({
    onImportComplete: () => {
      // Refresh your trade list
      fetchTrades();
    },
    onError: (error) => {
      console.error('Import failed:', error);
    },
  });

  const handleFileUpload = async (file: File) => {
    const csvContent = await file.text();
    await importCSV(csvContent, { pnlTolerance: 2.0 });
  };

  return (
    <>
      {/* Your import button/UI */}
      
      <DuplicateReviewModal
        isOpen={showDuplicateModal}
        onClose={closeDuplicateModal}
        duplicates={potentialDuplicates}
        newTradesCount={newTrades.length}
        onMerge={handleMerge}
        onKeepBoth={handleKeepBoth}
        onSkip={handleSkip}
        onMergeAll={handleMergeAll}
        onKeepAll={handleKeepAll}
      />
    </>
  );
}
```

## API Endpoints

### POST /api/trades/import

Import trades with duplicate detection:

```json
{
  "csv": "CSV content here...",
  "detectDuplicates": true,
  "pnlTolerance": 2.0,
  "skipImport": true  // Set true to only detect, don't save
}
```

Response includes:
```json
{
  "success": true,
  "requiresReview": true,
  "data": {
    "potentialDuplicates": [...],
    "newTrades": [...],
    "stats": {
      "totalInCSV": 10,
      "potentialDuplicates": 3,
      "newTrades": 7
    }
  }
}
```

### PUT /api/trades/import/merge

Handle merge decisions:

```json
{
  "action": "merge",  // or "keep_both" or "skip"
  "dashboardTradeId": "uuid",
  "csvTradeData": { ...trade object... }
}
```

## Testing

Test the feature with the mock data in `__tests__/trading/duplicate-detection.test.ts`.

## Future Enhancements

- Auto-merge option for high-confidence matches
- Configurable PnL tolerance in user settings
- Bulk review with keyboard shortcuts
- Merge history/audit log
