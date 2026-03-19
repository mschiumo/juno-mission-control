# Juno Trading Terminal

A production-ready trading dashboard focused on pre-market gap analysis, position management, and trade tracking.

## Features

### Market Analysis
- **Gap Scanner** - Real-time premarket gap up/gap down detection (Polygon.io powered)
- **Market Overview** - Live market indices and sector performance
- **News Screener** - Market-moving news filtered by category

### Trade Management
- **Position Calculator** - Risk/reward calculation with share sizing
- **Daily Favorites** - Quick watchlist with premarket data
- **Potential Trades** - Complete trade setups with entry/stop/target
- **Active Trades** - Real-time P&L tracking
- **Closed Positions** - Trade history and performance analytics

### Profit Projection
- **Strategy Calculator** - Project returns based on win rate, risk/reward, trade frequency

## Tech Stack

- **Framework:** Next.js 14 (App Router)
- **Styling:** Tailwind CSS
- **Data APIs:** Polygon.io, Finnhub
- **Database:** Redis (Upstash)
- **Deployment:** Vercel

## Environment Variables

```bash
# Required
POLYGON_API_KEY=your_polygon_key
FINNHUB_API_KEY=your_finnhub_key
UPSTASH_REDIS_URL=your_redis_url

# Optional
NEXT_PUBLIC_APP_URL=https://your-domain.com
```

## Getting Started

1. Clone the repository
2. Copy `.env.example` to `.env.local` and fill in your API keys
3. Install dependencies: `npm install`
4. Run development server: `npm run dev`
5. Open http://localhost:3000

## API Endpoints

### Trading Data
- `GET /api/gap-scanner-polygon` - Fast gap scanner (1 API call)
- `GET /api/gap-scanner` - Finnhub-based scanner (fallback)
- `GET /api/premarket?symbol=TICKER` - Premarket data for single stock
- `GET /api/symbols/search?q=QUERY` - Symbol autocomplete

### Trade Management
- `GET /api/watchlist` - User's watchlist
- `POST /api/watchlist` - Add to watchlist
- `GET /api/active-trades` - Active positions
- `GET /api/closed-positions` - Trade history

## Production Deployment

### Vercel
1. Connect your GitHub repository to Vercel
2. Add environment variables in Vercel dashboard
3. Deploy

### Database Setup
The app uses Redis for caching and data storage. No additional setup required if using Upstash.

## Architecture

This trading terminal was created by stripping non-trading features from Juno Mission Control:

**Removed:**
- Habit tracking
- Calendar/events
- Goals system
- Gmail integration
- Daily journal
- Subagents

**Kept:**
- All trading components
- Market data APIs
- Gap scanning
- Position management
- P&L tracking

## License

Private - For personal use only
