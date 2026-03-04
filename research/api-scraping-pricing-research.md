# API & Scraping Services Pricing Research

*Research Date: March 4, 2026*
*Purpose: Market sentiment analysis and Twitter/X data scraping*

---

## 1. APIFY - Web Scraping Platform

Apify is a cloud-based web scraping and automation platform with 22,000+ pre-built scrapers (Actors).

### Pricing Tiers

| Plan | Monthly Cost | Key Features |
|------|-------------|--------------|
| **Free** | $0 | $5 prepaid usage, 8GB RAM, 25 concurrent runs, limited Actor rentals |
| **Starter** | $29 + pay-as-you-go | $30 prepaid usage, 32GB RAM, 32 concurrent runs, 30 datacenter IPs |
| **Scale** | $199 + pay-as-you-go | $200 prepaid usage, 128GB RAM, 128 concurrent runs, 200 IPs |
| **Business** | $999 + pay-as-you-go | $1,000 prepaid usage, 256GB RAM, 256 concurrent runs, 500 IPs |
| **Enterprise** | Custom | Custom limits, dedicated account manager |

### Usage Costs (Compute Units)
- Free: $0.30/CU
- Starter: $0.30/CU
- Scale: $0.25/CU
- Business: $0.20/CU

### Add-ons
- Concurrent runs: $5/run
- Actor RAM: $2/GB
- Datacenter proxy: from $0.60/IP
- Residential proxies: $8/GB ($7/GB on Business)

### Twitter Scraping on Apify
- Pay-per-result scrapers available (~$0.25/1,000 tweets via kaitoeasyapi actor)
- Alternative: $3.75/1,000 tweets (higher-end actors)

---

## 2. Twitter/X API - Official vs Third-Party

### Official X API Pricing (2025-2026)

| Tier | Monthly Cost | Limits | Annual Option |
|------|-------------|--------|---------------|
| **Free** | $0 | 1,500 tweets/month read, write-only for testing | N/A |
| **Basic** | $200 | ~10,000-15,000 tweets/month | $2,100/year |
| **Pro** | $5,000 | ~1M tweets/month | $54,000/year |
| **Enterprise** | $42,000+ | 50M+ posts/month, custom limits | Custom |

### New: Pay-Per-Use Pilot (Nov 2025)
- Credit-based system
- Capped at Pro plan limits
- $500 voucher for beta participants
- Self-serve model

### Third-Party: TwitterAPI.io

| Feature | TwitterAPI.io | Official X API |
|---------|--------------|----------------|
| **Cost per 1K tweets** | $0.15 | $100+ |
| **Setup time** | <5 minutes | Weeks (approval) |
| **Rate limit** | 1000+ req/sec | 300 req/15min |
| **Support** | 24/7 Live Chat | Almost none |
| **Free trial** | $0.10 credits | Very limited |

### Other Third-Party Options
- **TweetAPI.com**: $17/mo (100K requests), $57/mo (500K), $197/mo (2M)
- **Various Apify actors**: $0.25-$3.75 per 1K tweets

---

## 3. Finnhub - Financial News & Market Data

### Free Tier (Most Generous in Industry)
- **60 API calls per minute**
- Real-time stock prices (WebSocket + REST)
- Forex and cryptocurrency data
- Company fundamentals
- Economic data
- Alternative data (social sentiment, news)

### Premium/Enterprise
- Finnhub uses custom pricing for premium tiers
- Must contact sales for paid plan details
- Historical Reddit mentions and social sentiment available
- No publicly listed fixed pricing (enterprise-focused)

### Data Coverage
- Real-time US stock prices
- Global fundamentals
- ETFs holdings
- Alternative data (earnings call transcripts, social sentiment)

---

## 4. Alternative Scraping Services

### ScrapingBee

| Plan | Monthly Cost | API Credits | Concurrent Requests |
|------|-------------|-------------|---------------------|
| **Freelance** | $49 | 250,000 | 10 |
| **Startup** | $99 | 1,000,000 | 50 |
| **Business** | $249 | 3,000,000 | 100 |
| **Business+** | $599 | 8,000,000 | 200 |

**Features:**
- JavaScript rendering
- Rotating & premium proxies
- Geotargeting
- Screenshots, extraction rules
- Google Search API

**Free trial:** 1,000 API calls (no credit card)

### Bright Data (Enterprise-Grade)

#### Proxy Networks
| Type | Pay-As-You-Go | Monthly Plans |
|------|--------------|---------------|
| **Residential** | $8/GB | $499-$1,999/mo (bulk discounts) |
| **Datacenter** | - | $18-$1,300/mo (10-1000+ IPs) |
| **ISP** | - | $14-$900/mo (10-1000+ IPs) |
| **Mobile** | $8/GB | $499-$1,999/mo |

**Current promotion:** 50% off first deposit (up to $500 match)

#### Web Scraper API
- Pre-built scrapers for 100+ domains
- X/Twitter scraper available
- LinkedIn, Amazon, Instagram, TikTok, etc.
- Structured JSON output
- CAPTCHA solving included

#### KYC Required
- Residential and Mobile proxies require verification
- Quick video call + company verification

---

## Recommendations

### For Twitter/X Data (Market Sentiment)

**Budget Option: TwitterAPI.io**
- Best price/performance ratio
- $0.15/1K tweets vs $100+/1K via official API
- No approval process
- 96% cost savings vs official API

**Mid-Range: Apify + Actor**
- Use kaitoeasyapi/twitter-x-data-tweet-scraper
- ~$0.25/1,000 tweets
- Flexibility to scrape other platforms
- $29/mo Starter plan sufficient for small-medium projects

**Enterprise: Bright Data**
- If you need multiple data sources
- Superior proxy infrastructure
- Pre-built scrapers for all major platforms
- Best for high-volume, production systems

### For Financial News & Sentiment

**Best Free Option: Finnhub**
- 60 calls/minute free tier
- Real-time prices + social sentiment
- No credit card required
- Good for prototyping and small projects

**Alternative: Alpha Vantage**
- Free tier: 25 calls/day
- Premium: ~$50/month
- Good for US market data

### For General Web Scraping

| Use Case | Recommended Service | Why |
|----------|---------------------|-----|
| Small projects, learning | Finnhub + Apify Free | Zero cost to start |
| Medium volume, multi-source | Apify Starter ($29) | Flexibility, pre-built actors |
| High volume, reliability | ScrapingBee ($99-249) | Predictable pricing, good support |
| Enterprise, all-in-one | Bright Data ($500+) | Best infrastructure, compliance |

---

## Cost Comparison Summary

### Twitter Data Only (1M tweets/month)

| Service | Monthly Cost |
|---------|-------------|
| Official X API Pro | $5,000 |
| TwitterAPI.io | ~$150 |
| Apify (cheapest actor) | ~$250 |
| Bright Data Web Scraper | ~$500-1,000 |

### Market Sentiment Stack (Twitter + News)

| Combination | Est. Monthly Cost |
|-------------|------------------|
| **Budget** | TwitterAPI.io + Finnhub Free = ~$50-150 |
| **Balanced** | Apify Starter + Finnhub Free = ~$29-100 |
| **Premium** | Bright Data + Custom = ~$500+ |

---

## Key Takeaways

1. **Avoid Official X API** unless enterprise - 100x more expensive than alternatives
2. **TwitterAPI.io** offers the best value for Twitter data specifically
3. **Apify** provides the most flexibility for multi-platform scraping
4. **Finnhub** is unbeatable for free financial data (60 calls/min)
5. **Bright Data** is the premium choice for enterprise-grade reliability
6. **ScrapingBee** offers predictable pricing for general web scraping

---

*End of Research Summary*
