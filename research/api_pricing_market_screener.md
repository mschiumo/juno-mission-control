# API Pricing Research for Market Sentiment Screener
*Goal: w1771194085881 | Action Item: ai-1771194120240*
*Research completed: 2026-02-22*

---

## 1. Apify Platform Pricing

| Plan | Monthly Cost | Compute Unit Price | Max RAM | Concurrent Runs |
|------|-------------|-------------------|---------|-----------------|
| **Free** | $5 prepaid | $0.40/CU overage | 8 GB | Limited |
| **Starter** | $29 + pay as you go | $0.30/CU | 8 GB | 25 |
| **Scale** | $199 + pay as you go | $0.25/CU | 32 GB | 32 |
| **Business** | $999 + pay as you go | $0.20/CU | 128 GB | 128 |

**Compute Unit (CU)**: 1 CU = 1 GB RAM per hour

**Add-ons:**
- Concurrent runs: $5/run
- Actor RAM: $2/GB
- Datacenter proxy: from $0.60/IP
- Residential proxies: $7-8/GB
- Priority support: $100
- Personal training: $150/hour

---

## 2. Finnhub API (Stock Market Data)

| Tier | Rate Limit | Price | Features |
|------|-----------|-------|----------|
| **Free** | 60 calls/minute | FREE | Real-time data, fundamentals, WebSocket |
| **Paid** | Higher limits | From ~$49.99/month | Increased quotas |

**Best for**: Most generous free tier for stock data. Real-time WebSocket support, company fundamentals, economic data, sentiment analysis.

---

## 3. Polygon.io API (Stock Market Data)

| Plan | Monthly Cost | Rate Limit | Features |
|------|-------------|------------|----------|
| **Free** | FREE | 5 calls/minute | End-of-day data, historical |
| **Starter** | $29 | Unlimited | 15-minute delayed data |
| **Stocks Developer** | $79 | Unlimited | Real-time, 10 years historical |
| **Options Developer** | $79 | Unlimited | Options data, Greeks, IV |

**Note**: APIs priced separately by asset class (stocks, options, indices, etc.)

---

## 4. News APIs

### NewsAPI.org
- **Developer plan**: Development/testing ONLY (no production use)
- **Paid plans**: Starting at ~$449/month
- **Enterprise**: Up to ~$1,749/month

### GNews.io

| Plan | Monthly Cost | Daily Requests | Articles/Request | Features |
|------|-------------|----------------|------------------|----------|
| **Free** | €0 | 100 | 10 | 12-hour delay, 30 days history |
| **Essential** | €49.99 | 1,000 | 25 | Real-time, history from 2020 |
| **Business** | €99.99 | 5,000 | 50 | Full content, email support |
| **Enterprise** | €249.99 | 25,000 | 100 | Premium support |

**Note**: 10-day free trial available for paid plans

---

## 5. Twitter/X Data Alternatives

### TwitterAPI.io (Third-party Alternative)

| Metric | Price |
|--------|-------|
| Tweets | $0.15 per 1,000 tweets |
| Profiles | $0.18 per 1,000 profiles |
| Rate limit | 1,000+ req/sec |
| Monthly fee | NONE (pure pay-as-you-go) |

**Features**: No approval process, real-time data, 24/7 support, 99.99% uptime SLA

### Official X API

| Plan | Monthly Cost | Read Limit | Write Access |
|------|-------------|------------|--------------|
| **Free** | FREE | Write-only | Yes |
| **Basic** | $200 | 15,000 reads/month | Yes |
| **Pro** | $5,000 | 1,000,000 reads/month | Yes |
| **Enterprise** | Custom | Custom | Yes |

**Cost comparison**: TwitterAPI.io is ~96% cheaper than official X API ($0.15 vs $10+ per 1K tweets)

---

## Summary Recommendations

**For Market Sentiment Screener:**

| Service | Recommended Option | Cost |
|---------|-------------------|------|
| **Stock Data** | Finnhub Free | FREE (60 calls/min) |
| **News Data** | GNews Essential | €49.99/month |
| **Social Sentiment** | TwitterAPI.io | $0.15 per 1K tweets |
| **Web Scraping** | Apify Free/Starter | $5-29/month |

**Budget Stack**: Finnhub free + Apify free + TwitterAPI.io pay-as-you-go + GNews Essential = ~€50-80/month

**Production Stack**: Polygon Stocks Developer + Apify Scale + TwitterAPI.io + GNews Business = ~$350/month

---

## Data Sources

- https://apify.com/pricing
- https://finnhub.io/pricing
- https://polygon.io/pricing
- https://newsapi.org/pricing
- https://gnews.io/pricing
- https://twitterapi.io/
- https://getlate.dev/blog/twitter-api-pricing
