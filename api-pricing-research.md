# API & Apify Pricing Research for Market Sentiment Analysis

## 1. Apify Pricing (Web Scraping Platform)

Apify is a cloud platform for web scraping and data extraction with 19,000+ pre-built Actors.

| Plan | Monthly Cost | Prepaid Usage | Compute Units | Max RAM | Concurrent Runs | Support |
|------|--------------|---------------|---------------|---------|-----------------|---------|
| **Free** | $0 | $5/month | $0.30/CU | 8 GB | 25 | Community |
| **Starter** | $29 + pay-as-you-go | $29/month | $0.30/CU | 32 GB | 32 | Chat |
| **Scale** | $199 + pay-as-you-go | $199/month | $0.25/CU | 128 GB | 128 | Priority chat |
| **Business** | $999 + pay-as-you-go | $999/month | $0.20/CU | 256 GB | 256 | Account manager |
| **Enterprise** | Custom | Custom | Custom | Custom | Custom | Custom |

**Additional Costs:**
- Residential proxies: $7-8/GB
- Datacenter proxies: 5-500 IPs included, then $0.60-1.00/IP
- SERPs proxy: $1.70-2.50/1,000 SERPs
- Storage & data transfer: Additional fees apply

**Best For:** Pre-built scrapers for social media, Google Maps, e-commerce sites. Good for extracting data from websites without building custom scrapers.

---

## 2. Twitter/X API Pricing

### Official X API (developer.x.com)

| Plan | Monthly Cost | Posts/Month | Reads/Month | App IDs |
|------|--------------|-------------|-------------|---------|
| **Free** | $0 | 500 (user) | 100 (app) | 1 |
| **Basic** | $200 | 50,000 | 15,000 | 2 |
| **Pro** | $5,000 | 300,000 | 1,000,000 | 3 |
| **Enterprise** | $42,000+ | Custom | Custom | Custom |

**Note:** X recently introduced pay-per-use pricing as a pilot program for more flexible access.

### TwitterAPI.io (Third-party Alternative)

**Pay-as-you-go pricing - No monthly commitment:**
- **Tweets:** $0.15 per 1,000 tweets
- **Profiles:** $0.18 per 1,000 users
- **Followers:** $0.15 per 1,000 followers

**Savings vs Official API:** ~97% cheaper than X Pro plan
- With $5,000: Official API = 1M reads | TwitterAPI.io = 33M+ reads

### RapidAPI Twitter Alternatives
- **Old Bird V2 API:** Up to 1,000,000 tweets/month for $179.99
- Various other third-party options available on RapidAPI marketplace

**Recommendation:** For market sentiment analysis, third-party APIs like TwitterAPI.io offer massive cost savings while providing the same data.

---

## 3. Financial News API Pricing

### NewsAPI.org

| Plan | Monthly Cost | Requests | Usage |
|------|--------------|----------|-------|
| **Developer** | Free | 100/day | Development/testing only |
| **Standard** | ~$449/mo | 10,000/day | Commercial use |
| **Enterprise** | Custom | Custom | Full commercial rights |

**Note:** Developer plan cannot be used in production. Full article content not available via API (URLs only).

### NewsAPI.ai (Event Registry)

| Plan | Monthly Cost | Tokens/Month | Recent Searches | Historical Searches |
|------|--------------|--------------|-----------------|---------------------|
| **5K Plan** | $90 | 5,000 | 500,000 | 100,000 |
| **10K Plan** | $150 | 10,000 | 1,000,000 | 500,000 |
| **50K Plan** | $450 | 50,000 | 5,000,000 | 2,500,000 |
| **Enterprise** | Custom | Custom | Custom | Custom |

**Token Usage:**
- Recent articles (last 30 days): 1 token per search
- Historical articles: 5 tokens per searched year
- Event search: 5 tokens (recent) / 20 tokens per year (archive)

**Features:** Entity recognition, sentiment analysis, article clustering, CORS enabled, 99.99% SLA

### NewsData.io

| Plan | Monthly/Yearly | API Credits | Articles/Credit |
|------|----------------|-------------|-----------------|
| **Free** | $0 | 200/day | 10 articles |
| **Basic** | $199/mo or $1,919/yr | 20,000/mo | 50 articles |
| **Professional** | $399/mo or $3,839/yr | 50,000/mo | 50 articles |
| **Enterprise** | $599/mo or $5,759/yr | 100,000/mo | 50 articles |

---

## 4. Financial Market Data APIs

### Finnhub

| Plan | Cost | Features |
|------|------|----------|
| **Free** | $0 | Real-time stock prices (limited), fundamentals, forex, crypto |
| **Premium** | Custom | Higher rate limits, premium endpoints, institutional-grade data |

**Features:** Real-time stock prices, company fundamentals, economic data, alternative data, global ETFs holdings

### Alpha Vantage

| Plan | Cost | Limits |
|------|------|--------|
| **Free** | $0 | 25 API requests/day |
| **Premium** | Custom | Higher limits, premium functions, realtime US market data |

**Features:** Realtime & historical stock data, 50+ technical indicators, options data, JSON/Excel formats

### Polygon.io

| Plan | Monthly Cost | Features |
|------|--------------|----------|
| **Basic** | Free | Limited endpoints, delayed data |
| **Starter** | $29 | Real-time data, 5+ years historical |
| **Developer** | $79 | More endpoints, higher limits |
| **Pro** | $199 | Full market coverage, WebSocket streaming |
| **Enterprise** | Custom | Full features, custom solutions |

---

## 5. Other Relevant APIs for Market Sentiment

### Reddit API
- **Free tier:** 100 requests/minute (OAuth required)
- Good for community sentiment analysis

### StockTwits API
- API access available for enterprise
- Social sentiment for stocks/crypto

### Alternative Data Sources on Apify:
- **Twitter scrapers:** Various pricing
- **Reddit scrapers:** Various pricing  
- **News site scrapers:** Free to $50+/month

---

## Summary Recommendations for Market Sentiment Project

### Budget Tier (Under $100/month):
- **News:** NewsAPI.org Developer (free) + NewsData.io Basic ($199/mo if needed)
- **Twitter:** TwitterAPI.io pay-as-you-go (~$15-50/month depending on volume)
- **Market Data:** Alpha Vantage Free or Finnhub Free
- **Scraping:** Apify Free ($5 credit/month)

### Mid-Tier ($100-500/month):
- **News:** NewsAPI.ai 5K Plan ($90/month)
- **Twitter:** TwitterAPI.io or RapidAPI Old Bird ($50-180/month)
- **Market Data:** Polygon.io Starter ($29/month)
- **Scraping:** Apify Starter ($29/month)

### Professional Tier ($500+/month):
- **News:** NewsAPI.ai 50K Plan ($450/month)
- **Twitter:** TwitterAPI.io high volume or X Basic ($200/month)
- **Market Data:** Polygon.io Pro ($199/month)
- **Scraping:** Apify Scale ($199/month)

### Key Takeaways:
1. **Avoid X Official API** unless absolutely necessary - third-party alternatives save 90-97%
2. **Apify** is excellent for pre-built scrapers but charges for compute usage
3. **NewsAPI.ai** offers the best value for news sentiment with built-in NLP features
4. **Finnhub** and **Alpha Vantage** provide good free tiers for market data
5. Consider combining multiple sources for comprehensive sentiment analysis
