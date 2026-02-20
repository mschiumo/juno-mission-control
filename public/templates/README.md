# Trade Import Template

## Excel/CSV Template for Importing Trades

Download the CSV template: [trades_import_template.csv](./trades_import_template.csv)

## Required Columns

| Column | Description | Example |
|--------|-------------|---------|
| Date | Trade date (YYYY-MM-DD) | 2024-01-15 |
| Symbol | Stock ticker | AAPL |
| Side | long or short | long |
| Entry_Price | Entry price | 185.50 |
| Exit_Price | Exit price | 188.25 |
| Shares | Number of shares | 100 |
| Entry_Time | Entry time (HH:MM) | 09:35 |
| Exit_Time | Exit time (HH:MM) | 10:15 |
| Fees | Commissions/fees | 4.95 |
| Strategy | Trading strategy | breakout |
| Setup_Type | Specific setup | morning_breakout |
| Tags | Comma-separated tags | gap,momentum |
| Emotion | Your emotional state | confident |
| Notes | Additional notes | Followed plan perfectly |

## Strategy Options

- `breakout` - Breakout trading
- `pullback` - Pullback to support/MA
- `trend_following` - Following established trend
- `mean_reversion` - Reversion to mean
- `scalp` - Quick scalp trades
- `other` - Other strategies

## Emotion Options

- `confident` - Felt confident
- `fearful` - Felt fear/anxiety
- `greedy` - Held too long for more
- `fomo` - Fear of missing out
- `patient` - Waited for setup
- `impatient` - Forced trades
- `neutral` - Emotionally neutral

## Sample Data

```csv
Date,Symbol,Side,Entry_Price,Exit_Price,Shares,Strategy,Emotion,Notes
2024-01-15,AAPL,long,185.50,188.25,100,breakout,confident,Good entry
2024-01-15,TSLA,long,210.00,208.50,50,pullback,patient,Cut loss quickly
2024-01-16,NVDA,long,520.00,535.00,25,trend_following,confident,Let winner run
```

## Import Steps

1. **Export from your broker:**
   - ThinkOrSwim: Monitor → Account Statement → Export
   - Interactive Brokers: Reports → Trade Confirmation
   - Generic: Use the template above

2. **Map columns:**
   - Our import will auto-detect common formats
   - Manually map if needed

3. **Preview and import:**
   - See first 10 rows before importing
   - Fix any errors
   - Confirm import

4. **Review:**
   - Check Calendar view
   - Verify P&L calculations
   - Add journal entries

## Tips

- **Dates:** Use YYYY-MM-DD format (2024-01-15)
- **Times:** Use 24-hour format (09:30, 14:45)
- **Prices:** Include decimals (185.50, not 185.5)
- **Tags:** Use commas to separate multiple tags
- **Notes:** Keep under 500 characters

## Questions?

See the full documentation: `docs/TRADERVUE_FEATURE_SPEC.md`
