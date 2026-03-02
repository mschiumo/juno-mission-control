# Market Sentiment Screener - API Pricing Research Report

**Research Date:** March 2, 2026  
**Goal:** w1771194085881  
**Action Item:** ai-1771194120240  
**Status:** ✅ COMPLETE

---

## Executive Summary

This report provides a comprehensive comparison of API pricing options for building a market sentiment screener tool that monitors Twitter sentiment, financial news, and key market events. Recommendations are provided for a **budget-conscious setup** that minimizes costs while maintaining functionality.

---

## 1. Apify Pricing Tiers

Apify is a web scraping and automation platform that offers pre-built "Actors" for various data collection tasks.

| Plan | Monthly Cost | Compute Units | Actor RAM | Concurrent Runs | Key Features |
|------|--------------|---------------|-----------|-----------------|--------------|
| **Free** | $0 | $5 prepaid | 8 GB | Up to 25 | Limited to $5/month usage, no rollover |
| **Starter** | $29 + pay-as-you-go | $0.30/CU | 8 GB | Up to 25 | Community support, Bronze Store discount |
| **Scale** | $199 + pay-as-you-go | $0.25/CU | 32 GB | Up to 128 | Priority chat, Silver Store discount |
| **Business** | $999 + pay-as-you-go | $0.20/CU | 128 GB | Up to 256 | Account manager, Gold Store discount |
| **Enterprise** | Custom | Custom | 256 GB+ | Custom | Dedicated support, custom terms |

### Additional Costs:
- **Residential Proxies:** $8/GB (Free: $8, Starter: $8, Scale: $7.50, Business: $7)
- **Datacenter Proxies:** $0.60-$1.00/IP depending on plan
- **Storage:** Dataset storage ~$0.80-$1.00 per 1,000 GB-hours
- **Data Transfer:** $0.18-$0.20/GB external

### Relevant Apify Actors for Market Sentiment:
- Twitter/X Scrapers (various pricing depending on actor)
- Reddit Scrapers
- News site scrapers
- Social media monitoring tools

**💡 Budget Recommendation:** Start with the **Free tier** ($5 prepaid usage) for initial development and testing. For production, the **Starter plan ($29/month)** provides sufficient resources for a small-to-medium sentiment monitoring operation.

---

## 2. Twitter/X Sentiment Analysis API Options

### Option A: Official X (Twitter) API

| Plan | Monthly Cost | Tweet Reads | Rate Limit | Best For |
|------|--------------|-------------|------------|----------|
| **Free** | $0 | Very limited (write-only) | 500 posts/month | Testing only |
| **Basic** | $100 | 10,000 tweets | 166 Tweets/min | Hobbyists, prototypes |
| **Pro** | $5,000 | 1 million tweets | 1,500 Tweets/min | Startups, scale |
| **Enterprise** | $42,000+ | Custom limits | Custom | Large-scale commercial |

**❌ Not Recommended for Budget-Conscious Setup:** The official API is prohibitively expensive for small projects.

---

### Option B: TwitterAPI.io (RECOMMENDED)

**Pricing Model:** Pay-as-you-go (no monthly fees)

| Endpoint | Cost |
|----------|------|
| **Tweets** | $0.15 per 1,000 tweets |
| **User Profiles** | $0.18 per 1,000 profiles |
| **Followers** | $0.15 per 1,000 followers |
| **Minimum per call** | $0.00015 (waived for bulk responses) |

**Credit System:**
- 1 USD = 100,000 credits
- $1 free credit on signup for testing
- Credits never expire when recharged
- Bonus credits with recharges (up to 5% discount)

**Features:**
- ✅ 96% cheaper than official X API
- ✅ No Twitter authentication required
- ✅ ~800ms response time
- ✅ 1,000+ queries per second
- ✅ 99.99% uptime
- ✅ Real-time data access
- ✅ Webhook support

**💡 Cost Comparison Example:**
- Reading 100,000 tweets/month:
  - Official X Pro: ~$500 (pro-rated from $5,000)
  - TwitterAPI.io: ~$15

---

### Option C: Apify Twitter Scrapers

- Various actors available with different pricing
- Typical cost: Higher than TwitterAPI.io for Twitter-specific data
- Good for: Complex scraping needs, historical data

---

## 3. Financial News APIs

### Option A: Finnhub (RECOMMENDED - Best Free Tier)

| Feature | Free Tier | Premium |
|---------|-----------|---------|
| **Cost** | $0 | Custom pricing |
| **Rate Limit** | 60 calls/minute | Higher limits |
| **Real-time Data** | ✅ Yes | ✅ Yes |
| **Historical Data** | 1 year per call | Full history |
| **Market Coverage** | US stocks, crypto, forex | Global |
| **News API** | ✅ Included | ✅ Included |
| **Sentiment Data** | ✅ Social sentiment | ✅ Enhanced |

**Free Tier Includes:**
- Real-time stock prices
- Company fundamentals
- Economic data
- Social sentiment analysis
- News sentiment
- Forex and cryptocurrency data
- 60 API calls/minute (3,600/hour, 86,400/day)

**💡 Budget Recommendation:** Finnhub's **free tier is exceptional** and likely sufficient for most sentiment screening needs. Only upgrade if you need global coverage or >60 calls/minute.

---

### Option B: NewsAPI.org

| Plan | Monthly Cost | Requests | Features |
|------|--------------|----------|----------|
| **Developer** | $0 | 100/day | Development/testing only |
| **Small** | ~$449/mo | 10,000/day | Commercial use |
| **Large** | ~$1,299/mo | 100,000/day | High volume |
| **Enterprise** | Custom | Custom | Custom terms |

**Limitations:**
- Developer plan cannot be used in production
- No full article content (URLs only)
- General news, not specifically financial

**❌ Not Recommended:** Pricing is steep for production use, and free tier is very limited.

---

### Option C: Financial Modeling Prep (FMP)

| Plan | Monthly Cost | Rate Limit | Best For |
|------|--------------|------------|----------|
| **Free** | $0 | 250 calls/day | Testing, basic data |
| **Starter** | $22/mo | 300 calls/min | Individual investors |
| **Premium** | $59/mo | 750 calls/min | Active traders |
| **Ultimate** | $149/mo | 3,000 calls/min | Professional use |

**Free Tier Includes:**
- End-of-day historical data
- Company profile and reference data
- 150+ endpoints access
- US market coverage

**💡 Budget Recommendation:** Good alternative if Finnhub limits are reached. Start with free tier, upgrade to Starter ($22/mo) for more historical data and higher rate limits.

---

### Option D: Alpha Vantage

| Plan | Monthly Cost | Requests | Notes |
|------|--------------|----------|-------|
| **Free** | $0 | 25/day | Very limited |
| **Premium** | ~$50-150/mo | Higher limits | Various tiers |

**Features:**
- Stock data, forex, crypto
- 50+ technical indicators
- AI-powered sentiment scores
- Market news API

**⚠️ Limitation:** Free tier is extremely limited at 25 requests/day - barely usable for real applications.

---

### Option E: Polygon.io

| Plan | Monthly Cost | Requests | Features |
|------|--------------|----------|----------|
| **Basic** | $0 | 5/minute | End-of-day data, aggregates |
| **Stocks Starter** | $29/mo | Unlimited | Real-time, SIP data |
| **Stocks Pro** | $79/mo | Unlimited | + Options data |
| **All-in-One** | $199/mo | Unlimited | All asset classes |

**Free Tier:**
- End-of-day data
- Historical aggregates
- 5 API calls/minute (very limited)

---

## 4. Dedicated Sentiment Analysis APIs

### Option A: StockGeist (Specialized Sentiment API)

| Feature | Free Tier | Paid |
|---------|-----------|------|
| **REST API Credits** | 10,000/month | Pay-as-you-go |
| **Crypto Streams** | 1 free | More available |
| **Stock Streams** | 5 free | More available |
| **Cost per Credit** | N/A | $0.0001 |

**Features:**
- Real-time sentiment analysis
- Social media sentiment (Reddit, Twitter, etc.)
- Financial news sentiment
- Trained specifically on financial language
- SSE streaming support

**💡 Budget Recommendation:** Excellent for dedicated sentiment analysis. Free tier (10k credits) allows significant testing and small-scale operation.

---

### Option B: Custom Sentiment Analysis (Self-Built)

Using open-source models (Hugging Face transformers):
- **Cost:** Free (compute costs only)
- **Pros:** Full control, no API limits
- **Cons:** Requires ML expertise, infrastructure

---

## 5. Market Data APIs (Price/Volume Context)

### Alpaca (RECOMMENDED for Market Data)

| Plan | Monthly Cost | Features |
|------|--------------|----------|
| **Free** | $0 | Real-time IEX data, 10,000 calls/min, 7+ years historical |
| **Premium** | Custom | SIP data, higher limits |

**Free Tier Includes:**
- Real-time market data (IEX)
- Historical stock data (7+ years)
- WebSocket streaming
- 10,000 API calls/minute
- Paper trading

**💡 Budget Recommendation:** Excellent free tier for market data. Highly recommended.

---

## 📊 Recommended Budget-Conscious Setup

### Tier 1: Free Tier Setup (Testing/MVP)
| Component | Service | Monthly Cost |
|-----------|---------|--------------|
| Twitter/X Data | TwitterAPI.io | $0-5 (testing credit) |
| Financial News | Finnhub (Free) | $0 |
| Market Data | Alpaca (Free) | $0 |
| Web Scraping | Apify (Free) | $0 |
| **TOTAL** | | **$0-5/month** |

### Tier 2: Production Starter Setup
| Component | Service | Monthly Cost |
|-----------|---------|--------------|
| Twitter/X Data | TwitterAPI.io | $15-30 (pay-as-you-go) |
| Financial News | Finnhub (Free) | $0 |
| Market Data | Alpaca (Free) | $0 |
| Web Scraping | Apify Starter | $29 |
| Sentiment Analysis | StockGeist (Free tier) | $0 |
| **TOTAL** | | **$44-59/month** |

### Tier 3: Scale Setup
| Component | Service | Monthly Cost |
|-----------|---------|--------------|
| Twitter/X Data | TwitterAPI.io | $50-100 |
| Financial News | FMP Starter | $22 |
| Market Data | Alpaca (Free) | $0 |
| Web Scraping | Apify Scale | $199 |
| Sentiment Analysis | StockGeist (Credits) | $20 |
| **TOTAL** | | **$291-341/month** |

---

## 🔑 Key Recommendations

### For Maximum Budget Efficiency:

1. **Start with all free tiers:**
   - TwitterAPI.io ($1 free credit)
   - Finnhub (60 calls/min free)
   - Alpaca (10,000 calls/min free)
   - Apify ($5 free usage)
   - StockGeist (10k credits free)

2. **Twitter Data Strategy:**
   - Use TwitterAPI.io instead of official X API (96% cheaper)
   - Start with pay-as-you-go to avoid monthly commitments
   - Estimated cost: $0.15 per 1,000 tweets

3. **News & Market Data:**
   - Finnhub free tier is remarkably generous
   - 60 calls/minute = 86,400 calls/day - likely sufficient
   - Alpaca provides excellent free market data

4. **Sentiment Analysis:**
   - StockGeist for specialized financial sentiment (10k free credits/month)
   - Or use Finnhub's built-in sentiment endpoints
   - Consider self-hosted models for high volume

5. **Web Scraping (if needed):**
   - Apify free tier for simple tasks
   - Upgrade to Starter ($29) only when necessary

---

## ⚠️ Important Considerations

1. **Rate Limits:** Free tiers have rate limits - design your application to handle 429 errors gracefully
2. **Data Attribution:** Check each provider's terms for attribution requirements
3. **Real-time vs Delayed:** Free tiers may have delayed data (15 min) - acceptable for sentiment analysis
4. **API Key Security:** Never expose API keys in client-side code
5. **Monitoring:** Track usage to avoid unexpected costs on pay-as-you-go services

---

## 📈 Cost Projection Examples

### Scenario 1: Monitoring 10 stocks, hourly updates
- **TwitterAPI.io:** 100 tweets/stock/day × 10 × 30 = 30,000 tweets = ~$4.50/month
- **Finnhub:** 240 calls/day (10 stocks × hourly + news) = well within free tier
- **Alpaca:** Historical + real-time data = free tier sufficient
- **Total:** ~$5/month

### Scenario 2: Monitoring 50 stocks, real-time sentiment
- **TwitterAPI.io:** 500 tweets/stock/day × 50 × 30 = 750,000 tweets = ~$112/month
- **Finnhub:** May need upgrade for >60 calls/min during peak
- **StockGeist:** 10k free credits + additional as needed
- **Apify:** Starter plan for additional scraping
- **Total:** ~$150-200/month

---

## Summary

For a **budget-conscious market sentiment screener**, the optimal stack is:

| Component | Recommended Service | Est. Monthly Cost |
|-----------|---------------------|-------------------|
| Twitter/X Data | TwitterAPI.io | $0-30 |
| Financial News | Finnhub (Free) | $0 |
| Market Data | Alpaca (Free) | $0 |
| Sentiment Analysis | StockGeist (Free) OR Finnhub | $0 |
| Scraping/Automation | Apify (Free/Starter) | $0-29 |
| **TOTAL** | | **$0-59/month** |

This setup provides comprehensive sentiment monitoring capabilities at a fraction of the cost of enterprise solutions while maintaining the flexibility to scale as needed.

---

**Report Completed By:** Subagent Research  
**Date:** March 2, 2026  
**Status:** ✅ Complete - Action item ai-1771194120240 marked as done
