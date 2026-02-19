#!/bin/bash
# Stock Watchlist Analysis for MJ
# Using Yahoo Finance v8 API (free, no key required)

cd /home/clawd/.openclaw/workspace/stock_analysis

# All tickers
BULLISH="RUBI AGAE TRNR BOXL YIBO ETSY RELY RBNE ITGR HLF APPN LMND DASH EBAY OXY CHWY FFAI LINE NAK SOXS"
BEARISH="MBRX EPAM BJDX TRAW BTDR TBI W CAR EPRX GLOB BTG RXT MD CVNA POOL TAP LKQ AEG CVI CAKE YETI SBSW VC CTSH OWL BX"
FAVORITES="MBRX EPAM CAR ITGR HLF RUBI"

ALL_TICKERS="$BULLISH $BEARISH"

echo "=== Stock Watchlist Analysis for MJ ==="
echo "Date: $(date -u '+%Y-%m-%d %H:%M UTC')"
echo ""

# Create output file
echo "{" > results.json
echo "  \"timestamp\": \"$(date -u '+%Y-%m-%dT%H:%M:%SZ')\"," >> results.json
echo "  \"tickers\": [" >> results.json

first=true
for ticker in $ALL_TICKERS; do
  echo "Fetching $ticker..."
  
  # Yahoo Finance v8 API
  response=$(curl -s "https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=2d" \
    -H "Accept: application/json" \
    -H "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" 2>/dev/null)
  
  # Extract data using jq if available
  if command -v jq &> /dev/null; then
    error=$(echo "$response" | jq -r '.chart.error // empty')
    if [ -n "$error" ] && [ "$error" != "null" ]; then
      echo "  Warning: Error for $ticker: $error"
      continue
    fi
    
    meta=$(echo "$response" | jq -r '.chart.result[0].meta // empty')
    if [ -z "$meta" ] || [ "$meta" = "null" ]; then
      echo "  Warning: No data for $ticker"
      continue
    fi
    
    symbol=$(echo "$response" | jq -r '.chart.result[0].meta.symbol // "'"$ticker"'"')
    price=$(echo "$response" | jq -r '.chart.result[0].meta.regularMarketPrice // .chart.result[0].meta.previousClose // 0')
    prev_close=$(echo "$response" | jq -r '.chart.result[0].meta.previousClose // .chart.result[0].meta.chartPreviousClose // 0')
    volume=$(echo "$response" | jq -r '.chart.result[0].meta.regularMarketVolume // 0')
    
    # Get previous day close from timestamps
    closes=$(echo "$response" | jq -r '.chart.result[0].indicators.quote[0].close // empty')
    if [ -n "$closes" ] && [ "$closes" != "null" ]; then
      # Get the last non-null close
      prev_close_from_closes=$(echo "$closes" | jq -r '[.[] | select(. != null)] | if length > 1 then .[-2] else .[0] end')
      if [ -n "$prev_close_from_closes" ] && [ "$prev_close_from_closes" != "null" ]; then
        prev_close=$prev_close_from_closes
      fi
    fi
    
    if [ "$first" = true ]; then
      first=false
    else
      echo "," >> results.json
    fi
    
    # Calculate change
    if [ "$prev_close" != "0" ] && [ -n "$prev_close" ]; then
      change=$(echo "scale=4; $price - $prev_close" | bc 2>/dev/null || echo "0")
      change_pct=$(echo "scale=4; ($change / $prev_close) * 100" | bc 2>/dev/null || echo "0")
    else
      change="0"
      change_pct="0"
    fi
    
    # Determine category
    if echo "$FAVORITES" | grep -qw "$ticker"; then
      category="favorite"
    elif echo "$BULLISH" | grep -qw "$ticker"; then
      category="bullish"
    else
      category="bearish"
    fi
    
    cat >> results.json << JSONEOF
    {
      "symbol": "$symbol",
      "category": "$category",
      "price": $price,
      "previousClose": $prev_close,
      "change": $change,
      "changePercent": $change_pct,
      "volume": $volume
    }
JSONEOF
    
    printf "  %s: $%s (change: %s%%)\n" "$symbol" "$price" "$change_pct"
  fi
  
  # Rate limiting - be nice to Yahoo
  sleep 0.3
done

echo "" >> results.json
echo "  ]" >> results.json
echo "}" >> results.json

echo ""
echo "=== Data saved to results.json ==="
