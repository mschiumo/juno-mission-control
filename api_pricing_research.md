# API Pricing Research - Market Sentiment Screener

*Compiled: February 23, 2026*

---

## 1. APIFY PRICING

| Plan | Monthly Cost | Prepaid Usage | Compute Units (CU) | Max RAM | Concurrent Runs | Key Features |
|------|--------------|---------------|-------------------|---------|-----------------|--------------|
| **Free** | $0 | $5 included | $0.30/CU | 8 GB | 25 | Community support, limited proxy |
| **Starter** | $29 | + pay as you go | $0.30/CU | 32 GB | 32 | Chat support, 30 datacenter IPs |
| **Scale** | $199 | + pay as you go | $0.25/CU | 128 GB | 128 | Priority chat, 200 IPs, Silver discount |
| **Business** | $999 | + pay as you go | $0.20/CU | 256 GB | 256 | Account manager, 500 IPs, Gold discount |
| **Enterprise** | Custom | Custom | Custom | Custom | Custom | Custom limits, dedicated support |

**Add-ons:**
- Concurrent runs: $5/run
- Actor RAM: $2/GB
- Datacenter proxy: from $0.60/IP
- Residential proxies: $7-8/GB
- Priority support: $100

**Notes:**
- 1 CU = 1 GB RAM/hour of compute
- Free plan blocks access when usage exceeded
- Paid plans continue with overage charges

---

## 2. TWITTER/X API PRICING

### Official X API

| Tier | Monthly Cost | Key Limits | Features |
|------|--------------|------------|----------|
| **Free** | $0 | Write-only, limited access | Development/testing only |
| **Basic** (Legacy) | $200/month | 10,000 GET/month, 50,000 POST/month | 2 app IDs, Login with X |
| **Pro** (Legacy) | $5,000/month | High-volume access | Real-time streaming, more endpoints |
| **Enterprise** | Custom pricing | Custom limits | Dedicated support, custom rate limits |

**New: Pay-Per-Use Pricing (Pilot)**
- Credits-based system (purchase upfront)
- Deduplication: Same resource requested within 24h = 1 charge
- Auto-recharge available
- xAI API credits earned based on spend (up to 20% back at $1,000+)

### TwitterAPI.io (Third-Party Alternative)

| Pricing Model | Cost | Notes |
|---------------|------|-------|
| **Pay-as-you-go** | $0.15 per 1,000 tweets | ~96% cheaper than official X API |
| **Profiles** | $0.18 per 1,000 users |
| **Followers** | $0.15 per 1,000 followers |
| **Minimum per call** | $0.00015 (15 credits) | Waived for bulk responses |
| **List functions** | $0.0015 per call |

**Credit System:**
- 1 USD = 100,000 credits
- Recharged credits never expire
- Bonus credits valid 30 days
- Up to 5% discount on higher recharges

### TwexAPI.io (Alternative)
- Starting at $50/month for unlimited access
- No rate limits
- Real-time data

---

## 3. FINNHUB PRICING

| Plan | Cost | Rate Limits | Features |
|------|------|-------------|----------|
| **Free** | $0 | 60 calls/minute (50-60 depending on source) | Real-time US stock prices, Forex, Crypto, WebSocket support, 1 year historical data per call |
| **Basic** | Custom (contact sales) | Higher limits | Premium data feeds |
| **Professional** | Custom (contact sales) | Unlimited | Priority support, all datasets |

**Key Features (Free Tier):**
- Real-time stock market data
- Company fundamentals
- Economic data
- Alternative data
- WebSocket support for streaming
- REST API + WebSocket
- 60 API calls/minute
- 1 year historical data per API call

**Notes:**
- Most generous free tier among financial APIs
- Good for development and prototyping
- No credit card required for free tier

---

## 4. OTHER FINANCIAL NEWS/SENTIMENT APIs

### Alpha Vantage

| Plan | Cost | Limits | Features |
|------|------|--------|----------|
| **Free** | $0 | 25 API requests/day | Stock data, forex, crypto, 50+ technical indicators, News & Sentiment API |
| **Premium** | Starting at ~$50/month | Higher limits | Real-time US market data, premium support |

**News & Sentiment Features:**
- Real-time financial news aggregation
- AI-powered sentiment scores
- Covers stocks, crypto, forex
- Topics: fiscal policy, M&A, IPOs, etc.

### NewsAPI.ai (Event Registry)

| Plan | Monthly Cost | Tokens | Features |
|------|--------------|--------|----------|
| **Free Trial** | $0 | Limited | Basic access |
| **5K Plan** | $90/month | 5,000 tokens | 500K current searches, 100K historical searches |
| **10K Plan** | $180/month | 10,000 tokens | More searches |
| **Custom** | Contact sales | Unlimited | Full features |

**Token Usage:**
- Recent article search (last 30 days): 1 token
- Historical search (per year): 5 tokens
- Extra tokens: $0.015 each

**Features:**
- Full article body
- Entity recognition
- Categorization
- Sentiment analysis
- Article clustering (events)
- 99.99% uptime SLA

### NewsAPI.org

| Plan | Cost | Limits | Notes |
|------|------|--------|-------|
| **Developer** | $0 | 100 requests/day | Development/testing ONLY |
| **Production** | $449/month | Higher limits | Commercial use |

**Note:** Developer plan cannot be used in production/staging environments.

### MarketAux

| Plan | Monthly Cost (Annual) | Monthly Cost | Daily Requests | Articles/Request |
|------|----------------------|--------------|----------------|------------------|
| **Free** | $0 | $0 | 100 | 3 |
| **Basic** | $24 | $29 | 2,500 | 20 |
| **Standard** | $41 | $49 | 10,000 | 50 |
| **Pro** | $83 | $99 | 25,000 | 100 |
| **Pro 50K** | $166 | $199 | 50,000 | 100 |

**Features (All Plans):**
- Sentiment analysis (-1 to +1 score)
- 200,000+ entities tracked
- 5,000+ news sources
- 80+ global markets
- 30+ languages
- Entity recognition per article

### Benzinga

| Plan | Cost | Features |
|------|------|----------|
| **Free Tier** | $0 | Basic news headlines, body text (via AWS Marketplace) |
| **Basic** | ~$300/month | Real-time news, sentiment analysis, historical data |
| **Enterprise** | Custom | Full API suite, dedicated support |

**Features:**
- Real-time financial news
- Earnings call transcripts
- Analyst ratings
- Sentiment analysis
- NLP-ready content

---

## RECOMMENDATIONS

### For Market Sentiment Screener (Cost-Conscious)

| Component | Recommended API | Plan | Monthly Cost | Why |
|-----------|-----------------|------|--------------|-----|
| **Social Sentiment** | TwitterAPI.io | Pay-as-you-go | $10-50 (estimated) | 96% cheaper than official X API, no monthly minimum |
| **Market Data** | Finnhub | Free | $0 | 60 calls/min, real-time data, generous limits |
| **News Sentiment** | MarketAux | Free or Basic ($24-29) | $0-29 | Built-in sentiment scoring, good free tier |
| **Alternative** | Alpha Vantage | Free | $0 | 25 calls/day for news + sentiment |

### Budget Scenarios

| Scenario | APIs Used | Est. Monthly Cost |
|----------|-----------|-------------------|
| **Minimal (Testing)** | Finnhub (free) + MarketAux (free) + TwitterAPI.io (minimal) | $0-20 |
| **Basic Production** | Finnhub (free) + MarketAux Basic ($24) + TwitterAPI.io (~$30) | ~$54 |
| **Full Featured** | Finnhub (free) + NewsAPI.ai 5K ($90) + TwitterAPI.io (~$50) | ~$140 |
| **Enterprise** | Benzinga + X API Pro + Apify Business | $1,000+ |

### Key Takeaways

1. **Finnhub** - Best free option for market data (60 calls/min)
2. **TwitterAPI.io** - Best value for social sentiment (avoid $200+ official API)
3. **MarketAux** - Best for news sentiment with built-in scoring
4. **Apify** - Use only if you need custom scraping actors
5. **NewsAPI.ai** - Good for comprehensive news analysis with entity recognition

### Migration Path Recommendation

1. **Phase 1 (Development):** Use all free tiers (Finnhub + MarketAux free + minimal TwitterAPI.io)
2. **Phase 2 (Testing):** Upgrade MarketAux to Basic ($24) for more volume
3. **Phase 3 (Production):** Scale TwitterAPI.io usage based on actual needs, evaluate NewsAPI.ai if more news depth needed
