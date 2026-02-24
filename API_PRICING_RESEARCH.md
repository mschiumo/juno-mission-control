# API Pricing Research for Market Sentiment Tracking

**Research Date:** February 24, 2026  
**Goal:** w1771194085881  
**Action Item:** ai-1771194120240

---

## 1. Apify Platform Pricing Tiers

Apify is a web scraping and automation platform that can be used to extract social media data, news, and other market sentiment sources.

### Plan Overview

| Plan | Monthly Cost | Prepaid Usage | Max Actor RAM | Concurrent Runs | Support |
|------|-------------|---------------|---------------|-----------------|---------|
| **Free** | $0 | $5 credits/month | 8 GB | 25 | Community |
| **Starter** | $29 | + pay-as-you-go | 32 GB | 32 | Chat |
| **Scale** | $199 | + pay-as-you-go | 128 GB | 128 | Priority chat |
| **Business** | $999 | + pay-as-you-go | 256 GB | 256 | Account manager |
| **Enterprise** | Custom | Unlimited | Custom | Custom | Custom |

### Compute Unit Pricing
- **Free/Starter:** $0.30 per Compute Unit (CU)
- **Scale:** $0.25 per CU
- **Business:** $0.20 per CU

*1 Compute Unit = 1 GB RAM/hour*

### Add-on Pricing
- **Concurrent runs:** $5/run
- **Actor RAM:** $2/GB
- **Datacenter proxy:** From $0.60/IP
- **Residential proxies:** $7-8/GB (varies by plan)
- **SERPs proxy:** $1.70-2.50/1,000 SERPs
- **Priority support:** $100
- **Personal training:** $150/hour

### Key Features for Market Sentiment
- Run scrapers for Twitter/X, Reddit, news sites
- Schedule automated data collection
- Integration with sentiment analysis Actors
- 7-day data retention on Free plan

### Creator Plan (for developers)
- **Cost:** $1/month for first 6 months
- **Includes:** $500 platform usage credits
- **Purpose:** Build and publish your own Actors

---

## 2. Twitter/X API Pricing for Sentiment Analysis

X (Twitter) offers several tiers for accessing their API, essential for social media sentiment tracking.

### Official X API Tiers (2025)

| Plan | Monthly Cost | Best For | Key Limits |
|------|--------------|----------|------------|
| **Free** | $0 | Development/testing only | 500 posts/month read limit |
| **Basic** | $200 | Small projects, prototyping | ~15,000 reads, 50,000 writes |
| **Pro** | $5,000 | High-traffic applications | Higher rate limits |
| **Enterprise** | $50,000+ | Large-scale commercial | Custom limits, dedicated support |

### Important Pricing Changes (2025)
- **June 2025:** Basic tier doubled from $100 → $200/month
- **July 2025:** Enterprise tiers being restructured
- **November 2025:** New Pay-Per-Use pricing pilot launched

### Pay-Per-Use Pricing (Beta)
X is testing a metered/credit-based pricing model:
- Pay only for API requests made
- Uses flexible credit-based system
- **Note:** For the same usage as Basic plan (~15k reads, 50k writes), estimated cost is ~$575/month (more expensive than Basic)

### Features by Tier
- **Basic:** Read posts, search recent tweets, user lookup, post metrics
- **Pro:** Full archive access, filtered stream, higher rate limits
- **Enterprise:** Complete firehose access, historical data, dedicated account team

### Alternative: Third-Party X APIs
Services like **twitterapi.io** claim to offer up to 97% cost savings compared to official X API pricing for similar data access.

---

## 3. Financial News APIs Pricing

### Alpha Vantage

**Best for:** Stock data with news & sentiment analysis

| Plan | Cost | Requests/Day | Requests/Minute |
|------|------|--------------|-----------------|
| **Free** | $0 | 25 | Limited |
| **Premium** | Variable | Unlimited | 75-1,200* |

*Premium plans vary by tier: 75, 150, 300, 600, or 1,200 requests/minute

**Features:**
- Real-time and historical stock data
- News & Sentiments API with AI-powered sentiment scores
- 50+ technical indicators
- 200,000+ stock tickers across 20+ exchanges
- JSON and CSV formats

**News & Sentiment Coverage:**
- Economics, technology, real estate topics
- Individual tickers (AAPL, AMZN, BTC, etc.)
- Machine learning-powered sentiment analysis

---

### Finnhub

**Best for:** Most generous free tier for development

| Plan | Cost | Rate Limit |
|------|------|------------|
| **Free** | $0 | 60 calls/minute |
| **Paid** | Variable | Higher limits |

**Features:**
- Real-time stock, forex, and cryptocurrency data
- Company fundamentals
- Economic data
- **Alternative data** including social sentiment
- SEC filings

**Sentiment Features:**
- Social sentiment endpoint available
- Aggregates sentiment from various sources
- Real-time updates

---

### NewsAPI.ai (Event Registry)

**Best for:** Comprehensive news coverage with sentiment analysis

| Plan | Monthly Cost | Tokens/Month | Features |
|------|--------------|--------------|----------|
| **Free** | $0 | Limited | Basic search |
| **5K Plan** | $90 | 5,000 | 500K recent searches, 100K historical |
| **10K Plan** | Higher | 10,000 | More searches |

**Token Usage:**
- Recent article search (last 30 days): 1 token
- Historical search (per year): 5 tokens
- Event search: 5 tokens (recent), 20 tokens/historical year
- Sentiment analysis aggregate: 5 tokens (recent), 10 tokens/historical year

**Features:**
- Full article content
- Entity recognition and disambiguation
- Article categorization
- Duplicate detection
- Sentiment analysis
- 99.99% uptime SLA
- Data back to 2014

---

### NewsAPI.org

**Best for:** Simple news aggregation

| Plan | Monthly Cost | Requests/Month | Notes |
|------|--------------|----------------|-------|
| **Developer** | $0 | Limited | Dev/testing only |
| **Paid Plans** | Custom | Higher | Contact for pricing |

**Limitations:**
- No full article content (URLs only)
- Developer plan for non-production use only
- Enterprise pricing starts around $1,749/month

---

### Stock News API

**Best for:** Stock-specific news with sentiment filtering

| Plan | Monthly Cost | Calls/Month | Key Features |
|------|--------------|-------------|--------------|
| **Free Trial** | $0 (5 days) | 100 | All features |
| **Basic** | ~$20-50 | 20,000 | Ticker news, sentiment filter, sources filter |
| **Premium** | ~$50-100 | 50,000 | Trending headlines, upgrades/downgrades, historical data |
| **Business** | Custom | Custom | Dedicated account manager, SLA, custom terms |

**Features:**
- Individual ticker news
- General market news
- Filter by news sources
- Filter by type & sentiment
- Trending headlines & events
- Upgrades/Downgrades tracking

---

## 4. Additional Relevant APIs for Market Sentiment

### Polygon.io

**Best for:** Real-time market data with institutional-grade quality

| Plan | Cost | Features |
|------|------|----------|
| **Basic** | Free | 5 API calls/min, 2 years historical, EOD prices |
| **Stocks Starter** | $29/month | Real-time stocks, 5+ years data |
| **Stocks Plus** | $79/month | More features |
| **Pro** | $199/month | Tick-level data, WebSocket |
| **Enterprise** | $329/month | Highest limits, all features |

**Note:** Each asset class (stocks, options, indices, forex, crypto) requires separate subscription.

**Sentiment-Related Features:**
- Short Volume and Short Interest APIs
- Market snapshots
- News integration (via Benzinga partnership)

---

### Financial Modeling Prep

**Best for:** Fundamentals + alternative data

| Plan | Cost | Features |
|------|------|----------|
| **Free** | $0 | Limited calls |
| **Starter** | $19/month | 250 calls/day |
| **Pro** | $49/month | Unlimited |
| **Enterprise** | Custom | Custom limits |

**Sentiment Features:**
- Historical Social Sentiment API
- Stocktwits sentiment data
- Twitter mention tracking

---

### StockGeist.ai

**Best for:** Dedicated social sentiment tracking

**Features:**
- Real-time sentiment for 2,200+ companies
- Social media mention tracking
- AI-powered sentiment indicators
- Stock market API available

**Pricing:** Contact for pricing (not publicly listed)

---

## 5. Cost Comparison Summary for Market Sentiment Stack

### Budget Option (~$0-50/month)
| Service | Tier | Cost |
|---------|------|------|
| Finnhub | Free | $0 |
| Alpha Vantage | Free | $0 |
| NewsAPI.ai | Free/5K | $0-90 |
| Apify | Free | $0 |
| **Total** | | **$0-90/month** |

### Mid-Tier Option (~$200-500/month)
| Service | Tier | Cost |
|---------|------|------|
| X API | Basic | $200 |
| Alpha Vantage | Premium (300 req/min) | ~$50-100 |
| Stock News API | Premium | ~$50-100 |
| Apify | Starter/Scale | $29-199 |
| **Total** | | **~$330-600/month** |

### Professional Option (~$1000+/month)
| Service | Tier | Cost |
|---------|------|------|
| X API | Pro | $5,000 |
| Polygon.io | Enterprise | $329 |
| NewsAPI.ai | Higher tier | $200+ |
| Alpha Vantage | Premium (1200 req/min) | $200+ |
| Apify | Business | $999 |
| **Total** | | **~$6,700+/month** |

---

## 6. Recommendations

### For Development/Prototyping
1. **Finnhub** (Free - 60 calls/min) - excellent for testing
2. **Alpha Vantage** (Free - 25 req/day) - good for small-scale sentiment
3. **Apify Free** ($5 credits) - for custom scraping needs

### For Production (Low Volume)
1. **X API Basic** ($200/month) - essential social sentiment
2. **Stock News API Basic** (~$20-50/month) - curated financial news
3. **Alpha Vantage Premium** (~$50/month) - stock data + sentiment
4. **Apify Starter** ($29/month) - automation

### For Production (High Volume)
1. **X API Pro** ($5,000/month) - high-volume social data
2. **Polygon.io Pro** ($199/month) - institutional market data
3. **NewsAPI.ai** ($90-200/month) - comprehensive news
4. **Apify Scale** ($199/month) - heavy automation workloads

---

## 7. Important Considerations

1. **Rate Limits:** Free tiers often have restrictive rate limits (25-60 calls/min)
2. **Data Retention:** Some APIs limit historical data access on lower tiers
3. **Real-time vs Delayed:** Free tiers often have delayed data (15-20 min)
4. **Sentiment Accuracy:** Different APIs use different ML models for sentiment
5. **Legal Compliance:** Ensure compliance with X/Twitter ToS when scraping
6. **Redundancy:** Consider using multiple data sources for accuracy

---

*Research completed: February 24, 2026*
