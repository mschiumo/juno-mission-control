# API & Apify Pricing Research - Market Sentiment Screener

*Research Date: 2026-02-22*

---

## 📊 APIFY PLATFORM PRICING

| Plan | Monthly Cost | Compute Units | Max RAM | Concurrent Runs | Notes |
|------|--------------|---------------|---------|-----------------|-------|
| **Free** | $0 | $5 credits/month | 8 GB | 25 | $0.30/CU overage; good for testing |
| **Starter** | $29 | + pay-as-you-go | 32 GB | 32 | $0.30/CU; Bronze Store discount |
| **Scale** | $199 | + pay-as-you-go | 128 GB | 128 | $0.25/CU; Silver Store discount |
| **Business** | $999 | + pay-as-you-go | 256 GB | 256 | $0.20/CU; Gold Store discount |

### Add-ons:
- Concurrent runs: $5/run
- Actor RAM: $2/GB
- Datacenter proxy: from $0.60/IP
- Residential proxies: $7-8/GB

### Apify Actors for Sentiment Analysis:
- **Tweet Scraper V2**: $0.40 per 1,000 tweets (min 50 tweets/query)
- **Cheapest Twitter Scraper**: $0.25 per 1,000 tweets (TwitterAPI.io)
- **Twitter Scraper Unlimited**: Event-based pricing for single tweets/threads

---

## 📈 FINANCIAL DATA APIs

### 1. FINNHUB (Recommended - Free Tier)

| Plan | Cost | Features |
|------|------|----------|
| **Free** | $0 | 60 API calls/minute, real-time US stocks, forex, crypto, fundamentals, news, 1 year historical |
| **Starter** | ~$15-50/month | Higher limits, websocket access |
| **Pro** | Custom | Commercial use, higher throughput |

**Pros:** Generous free tier, no credit card required, real-time data
**Best for:** Individual developers, personal projects

---

### 2. POLYGON.IO

| Plan | Cost | Features |
|------|------|----------|
| **Basic** | $0 | 5 API calls/minute, EOD data, 2 years historical aggregates |
| **Stocks Starter** | $199/month | Real-time data, unlimited calls, 20+ years history |
| **Options/Forex/Crypto** | Separate pricing | Each asset class separate |

**Note:** APIs priced separately by asset class; free tier is very limited

---

### 3. ALPHA VANTAGE

| Plan | Cost | Features |
|------|------|----------|
| **Free** | $0 | 25 requests/day, 60+ technical indicators, forex, crypto |
| **Premium** | $49.99-$599.99/month | Higher limits, real-time data |

**Pros:** Good for low-volume technical analysis
**Cons:** Very restrictive free tier (25/day)

---

## 📰 NEWS APIs

### 1. NEWSAPI.ORG

| Plan | Cost | Features |
|------|------|----------|
| **Developer** | $0 | 100 requests/day, dev/testing only |
| **Production** | ~$449/month | Commercial use, higher limits |

**Cons:** Free tier NOT for production; expensive paid tiers

---

### 2. GNEWS.IO (Better Value)

| Plan | Cost | Features |
|------|------|----------|
| **Free** | €0 | 100 req/day, 10 articles/request, 12hr delay, 30 days history |
| **Essential** | €49.99/mo | 1,000 req/day, 25 articles/request, real-time, full content |
| **Business** | €99.99/mo | 5,000 req/day, 50 articles/request |
| **Enterprise** | €249.99/mo | 25,000 req/day, 100 articles/request |

**Pros:** Full article content on paid tiers, reasonable pricing

---

### 3. NEWSAPI.AI

| Plan | Cost | Features |
|------|------|----------|
| **Free** | $0 | Limited queries, basic filters |
| **Paid** | Starting ~$200/month | Advanced filters, sentiment analysis, entity extraction |

**Pros:** Built-in sentiment analysis, concept/entity-based search

---

## 🐦 TWITTER/X APIs

### Official X API (Expensive)

| Plan | Cost | Features |
|------|------|----------|
| **Free** | $0 | 500 posts/mo (write), 100 reads/mo (app-level) |
| **Basic** | $200/month | 50K posts, 15K reads |
| **Pro** | $5,000/month | 300K posts, 1M reads |

### Alternative: TwitterAPI.io

| Pricing | Cost |
|---------|------|
| Tweets | $0.15 per 1,000 |
| Profiles | $0.18 per 1,000 |
| Followers | $0.15 per 1,000 |

**Savings:** ~97% cheaper than official API

---

## 💰 RECOMMENDED BUDGET-FRIENDLY STACK

### Option 1: FREE TIER (Development/Personal)

| Service | Cost | Purpose |
|---------|------|---------|
| **Apify Free** | $0 | Run scrapers with $5 monthly credits |
| **Finnhub Free** | $0 | Real-time stock data, fundamentals |
| **GNews Free** | $0 | News headlines (100/day) |
| **TwitterAPI.io** | Pay-as-you-go ~$0.15/1K tweets | Social sentiment |
| **Alpha Vantage** | $0 | Technical indicators (25/day) |

**Total: $0/month** (ideal for development/testing)

---

### Option 2: PRODUCTION (Small Scale)

| Service | Cost | Purpose |
|---------|------|---------|
| **Apify Starter** | $29/mo | Reliable scraping, 32GB RAM |
| **Finnhub Free** | $0 | Stock data (60 calls/min sufficient) |
| **GNews Essential** | ~$50/mo | Real-time news with full content |
| **TwitterAPI.io** | ~$20/mo | ~130K tweets for sentiment |

**Total: ~$99/month**

---

### Option 3: PRODUCTION (Medium Scale)

| Service | Cost | Purpose |
|---------|------|---------|
| **Apify Scale** | $199/mo | High-volume scraping |
| **Finnhub Paid** | ~$30/mo | Higher API limits |
| **GNews Business** | ~$100/mo | 5K requests/day |
| **TwitterAPI.io** | ~$50/mo | ~330K tweets |

**Total: ~$379/month**

---

## 🎯 RECOMMENDATIONS

1. **Start with FREE stack** - Validate concept with Finnhub + GNews free + Apify free credits
2. **Use TwitterAPI.io** instead of official X API (97% cost savings)
3. **Finnhub over Polygon** for free tier (60 calls/min vs 5 calls/min)
4. **GNews over NewsAPI** for production (better pricing, full content)
5. **Consider Apify Actors** for social scraping instead of building custom scrapers

---

## ⚠️ KEY CONSIDERATIONS

- **Apify free credits** ($5/month) sufficient for ~16K-20K tweets at $0.25/1K
- **Finnhub free tier** is very generous for personal use (60 calls/min)
- **Twitter/X official API** is prohibitively expensive for small projects ($200-$5000/mo)
- **NewsAPI.org free tier** is NOT for production use (dev only)
- **Polygon.io** requires separate subscriptions per asset class
- **Alpha Vantage** free tier very limited (25 requests/day)

---

## 📋 SUMMARY COMPARISON TABLE

| Service | Free Tier | Paid Start | Best For |
|---------|-----------|------------|----------|
| **Apify** | $5 credits | $29/mo | Web scraping, automation |
| **Finnhub** | 60 calls/min | ~$15/mo | Stock data, fundamentals |
| **Polygon.io** | 5 calls/min | $199/mo | Real-time data, history |
| **Alpha Vantage** | 25/day | $49.99/mo | Technical indicators |
| **GNews** | 100/day | €49.99/mo | Full news content |
| **NewsAPI.org** | 100/day (dev) | $449/mo | Headlines only |
| **Twitter Official** | 100 reads/mo | $200/mo | Official access |
| **TwitterAPI.io** | Pay-as-you-go | $0.15/1K tweets | Affordable social data |

---

*Action Item: ai-1771194120240 - Research pricing for APIs and Apify*  
**Status: COMPLETED** ✅
