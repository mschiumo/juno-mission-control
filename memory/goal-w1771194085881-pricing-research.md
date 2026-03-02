# API & Platform Pricing Research - Goal w1771194085881
## Apify Screener for Market Sentiment

**Research Date:** 2026-02-27  
**Status:** ✅ Action Item Complete

---

## 1. Apify Platform Pricing

Apify operates on a **hybrid subscription + usage pricing model**.

### Standard Plans

| Plan | Monthly Cost | Prepaid Usage | Compute Unit Price | Actor RAM |
|------|-------------|---------------|-------------------|-----------|
| **Free** | $0 | $5/month | $0.30/CU | 8 GB |
| **Starter** | $29/month + pay-as-you-go | Included | $0.30/CU | 32 GB |
| **Scale** | $199/month + pay-as-you-go | Included | $0.25/CU | - |
| **Business** | $999/month + pay-as-you-go | Included | $0.20/CU | - |
| **Enterprise** | Contact Sales | Unlimited | Custom | - |

### Creator Plan (For Developers)
- **$1/month** for first 6 months
- **$500 bonus** platform usage credit
- Limited to Universal Actors only
- Max consumption: $100
- Max residential proxies: 10 GB/month
- Max SERPs proxy: 10,000/month

### Add-ons
- Concurrent runs: $5/run
- Actor RAM: $2/GB
- Datacenter proxy: from $0.60/IP
- Priority support: $100
- Personal training: $150/hour

---

## 2. Finnhub API Pricing

Finnhub offers **institutional-grade financial data** with a generous free tier.

### Pricing Structure
- **Free Tier:** Very generous for retail investors
  - 50 API calls/minute
  - Real-time data for stocks, forex, crypto
  - 1 year of historical data per API call
  - Global fundamentals, ETFs holdings, alternative data

- **Premium Tiers:**
  - **Retail:** Starting at ~$50/month per dataset
  - **All-in-one Package:** $500/month for global access
  - Enterprise pricing available on request

### Key Features (Free & Paid)
- Real-time stock prices from global exchanges
- Company fundamentals & financial statements
- Economic data
- Social sentiment data endpoint
- Websocket support
- 15+ crypto exchanges
- 10 forex brokers

---

## 3. Twitter/X API Pricing

### Official X API (Twitter)
| Tier | Monthly Cost | Tweet Reads | Features |
|------|-------------|-------------|----------|
| **Free** | $0 | Write-only | Limited posting only |
| **Basic** | $200/month | 15,000 reads | Basic access |
| **Pro** | $5,000/month | 1M reads | Full features |
| **Enterprise** | $42,000+/month | Custom | Full archive access |

### Third-Party Alternatives

#### TwitterAPI.io
- **Pay-as-you-go pricing** - no minimum spend
- **$0.15 per 1,000 tweets** returned
- **$0.18 per 1,000 profiles**
- **$0.15 per 1,000 followers**
- Credits system: 1 USD = 100,000 credits
- Minimum charge: 15 credits ($0.00015) per API call
- Recharged credits never expire
- Bonus credits valid for 30 days
- **~96% cheaper** than official X API

#### Twexapi.io
- **Starting at $50/month** for unlimited access
- No rate limits
- Real-time data
- Instant setup
- Claims 96% savings vs official API

---

## 4. Other Market Sentiment APIs

### Stockgeist.ai
**Real-time market sentiment monitoring platform**

| Feature | Free Tier | Paid Tiers |
|---------|-----------|------------|
| REST API Credits | 10k/month | From $0.0001/credit |
| One-time Credits | 750k-12.5M | Bulk purchase options |
| Crypto Streams | 1 free forever | 25-100+ streams |
| Stock Streams | 5 free forever | 75-100+ streams |
| Bonus Credits | - | 10-60% bonus on bulk |

**Credit Pricing:**
- Basic price: $0.0001 per credit
- Bulk purchases get 10-25% bonus credits
- Large purchases (12.5M credits) get 60% more streams

### Financial Modeling Prep (FMP)
**Comprehensive financial data with social sentiment endpoint**

| Plan | Monthly Cost | API Calls | Features |
|------|-------------|-----------|----------|
| **Basic** | Free | 250/day | End of day data, 150+ endpoints |
| **Starter** | $22/mo | 300/min | 5 years history, fundamentals, news |
| **Premium** | $59/mo | 750/min | 30 years history, intraday, technicals |
| **Ultimate** | $149/mo | 3,000/min | Global coverage, 1-min charts, bulk data |

**Sentiment Features:**
- Social sentiment endpoint (via SentimentInvestor)
- Historical social sentiment data
- Updated hourly
- Sentiment field shows % positive activity
- General perception indicator

---

## Summary Recommendations

### Budget-Conscious Setup (Under $100/month)
1. **Apify Free** ($5/month usage) - For web scraping
2. **Finnhub Free** - Financial data & basic sentiment
3. **TwitterAPI.io** - Pay-as-you-go Twitter data
4. **FMP Basic/Starter** ($0-22/month) - Additional sentiment data

### Professional Setup ($100-300/month)
1. **Apify Starter** ($29/month) - Robust scraping infrastructure
2. **Finnhub Premium** (~$50/month) - Enhanced financial data
3. **TwitterAPI.io** (~$50-100/month usage) - Twitter sentiment
4. **Stockgeist** - Dedicated sentiment analysis

### Enterprise Setup ($500+/month)
1. **Apify Business/Enterprise** - Scale operations
2. **Finnhub All-in-one** ($500/month) - Full data access
3. **Official X API Pro** ($5,000/month) - Direct Twitter access
4. **FMP Ultimate** ($149/month) - Complete financial dataset

---

## Notes
- **Twitter sentiment** is most cost-effective through third-party APIs (twitterapi.io or twexapi.io)
- **Finnhub** offers the best free tier for financial data
- **Apify Creator Plan** is excellent for developers building custom scrapers
- **Stockgeist** specializes specifically in sentiment analysis with AI-calculated metrics
- All prices are approximate and subject to change; verify on official websites before purchasing

---

**Next Steps:**
- [ ] Evaluate specific data requirements
- [ ] Test free tiers of preferred services
- [ ] Calculate expected API usage volumes
- [ ] Set up proof-of-concept with selected APIs
