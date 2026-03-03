# Trading Rules & Strategy Guide

## Basic Formulas

### Stop Size
```
Stop Size = Entry Price - Stop Price

Example:
Entry Price = $4.00
Stop Price = $3.50
Stop Size = $0.50
```

### Share Size
```
Share Size = Risk in $ Amount / Stop Size

Example:
Risk = $20
Stop Size = $0.50
Share Size = 40 shares
```

### Risk Ratio
```
Reward Amount = Risk Amount in $ * Risk Ratio

Example:
Risk Amount = $20
Risk Ratio = 2:1
Reward Amount = $40 (minimum)
```

---

## Criteria for a Proper Trade

1. Find entry price
2. Find stop price
3. Find target price (resistance, support level)
4. Determine Risk Ratio
   - If ratio is at least 2:1, take the trade
   - If not, pass on the trade
5. Calculate share size

### Example Trade Setup

| Parameter | Value |
|-----------|-------|
| Risk | $20 |
| Desired Reward | $40 |
| Entry Price | $6.00 |
| Stop Loss | $5.90 |
| Stop Size | $0.10 ($6.00 - $5.90) |
| Target Price | $6.40 |
| Share Size | 200 shares ($20 / $0.10) |

---

## Metrics for Tracking Trading Progress

- **Win rate %**
- **Sharpe Ratio**
- **Average winner vs. Average loser**
- **Risk-to-reward ratio** (e.g., 2:1)
- **Amount of trades per day**

---

## Metrics for Journaling

- Time of trade
- Symbol/ticker
- Trading long/short
- Strategy (buy/sell setup, breakdown, etc.)
- Entry price
- Stop price
- Target price
- Exit price
- Total profit/loss
- Management style (trail loss, secure profits, etc.)

---

## Plan/Rules for Trading

### Initial Risk for Beginner Phase
- **$20/trade**

### Levels to Take Profit At
- **2R's**: Take 50% of profit if trailing (50% remaining)
- **3R's**: Take another 25% of position as profit (25% remaining)
- **4R's**: Take ALL remaining profit

### Protecting Profits
- If up 5R's or more on the day, must secure at least 75% of profits
- If in a trade, must protect AT LEAST 1R of profit

### Boundaries/Signs to STOP Trading for the Day
- If you lose more than 3R's in a day ($60 at this risk)
- If you lose more than 2 trades on a single ticker (switch ticker)
- If you lose more than 5 trades in a day, stop for the day
- **ALWAYS EXIT at STOP LOSS**
- Don't trade on news

---

## Strategy Requirements

### Buy Setup (MUST HAVES)
- Rising 20MA
- Entry bar
- Tight Stop
  - Ex: 3 red bars on pullback
- No deep retracement (between 40-60%)

### Like to Have
- Retracement into minor support
- Retracement into trend line
- Volume requirement (spike, continuation volume)
- Relative strength and market alignment (following the trend)

### Cannot Have
- Conflict on different timeframes
- Sloppiness (lots of topping/bottoming tails, erratic price action)
- Less than 2:1 reward to risk
- Scalping without proper setup

---

## Level II: Bid vs. Ask

### Getting Filled
- **Buyers** = bid
- **Sellers** = ask
- When shorting, you are buying the ask when you cover
- For buying (buy setup), we want a strong bid and a weak ask
- For shorting (sell setup), we want weak bid and strong ask
- If you sell, you get filled at the **BID**

### Order Execution
- Check whether stock is available to short
- Place **LIMIT orders** for stop losses and take profits

---

## Strategies to Close Trade

1. **Flatten** - sell at MKT
2. **Buy back** (when shorting) - buy at MKT

We use market because we want to exit immediately.

### Stop Losses
- Place **SELL STOP** at predetermined stop price when going long
- Place **BUY STOP** when going short
- BUY STOP is higher than current price (on the bid side)
- STOP orders all fill at MKT
- Don't exit too early

---

## Trade Management

### Bar-by-Bar (Scalping)
- Observe stop losses and take profits when longing/shorting
- Scalps will not always follow our risk formula, since they are so quick
- Need close trade management and smaller risk/size

### Live Trade Execution
- Time entry based on Level 2 Bid/Ask
- Account for slippage on large share size

---

## Trading Gaps

### Charts for Different Time Periods
- **9:30am - 10am**: Look at 1 and 2 minute charts
- **10am - 12pm**: Look at 2 and 5 minute charts
- **12pm - 4pm**: Look at 5 and 15 minute charts

### Criteria for a Good Gap (Scan 8:30am)
- Gap under support or gap over resistance
- We don't want to gap directly into support or resistance (makes it more difficult for the gap to continue)
- We want to see it gap directly above or directly under
- Is the gap ending a long-term trend?
- Is the gap over or under an existing long-term trend?
- Is the gap up or down aligned with the larger market?
  - Ex: A gap up in a stock in a market that is also uptrending gives it more momentum — that's a good gap

### How to Scan Gaps
1. Look for gaps
2. Look at daily chart for Level 2 data that shows the extent of the gap
3. Can add interesting stocks to 'default' watchlist for trading on that day
