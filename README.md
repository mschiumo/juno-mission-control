# Juno Mission Control Dashboard

A production-ready Next.js personal dashboard for managing cron jobs, calendar events, habits, market data, and projects.

Live at https://juno-mission-control.vercel.app/

## Features

- **📊 Dashboard UI** - Dark theme with tangerine accents, responsive grid layout
- **⏰ Cron Jobs** - View and trigger cron jobs with status indicators
- **📅 Calendar** - View upcoming events and create new ones
- **✅ Habit Tracking** - Track daily habits with streak counters
- **📈 Market Overview** - Real-time market data with auto-refresh
- **📁 Projects** - Track active projects and their progress
- **⚡ Quick Actions** - Fast access to frequently used apps

## Tech Stack

- **Framework**: Next.js 14+ (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **Icons**: Lucide React
- **Authentication**: Environment-based password protection

## Getting Started

### Prerequisites

- Node.js 18+ 
- npm or yarn

### Installation

1. Clone the repository:
```bash
git clone https://github.com/yourusername/juno-dashboard.git
cd juno-dashboard
```

2. Install dependencies:
```bash
npm install
```

3. Copy environment variables:
```bash
cp .env.local.example .env.local
```

4. Update `.env.local` with your credentials (see Configuration section)

5. Run the development server:
```bash
npm run dev
```

6. Open [http://localhost:3000](http://localhost:3000) in your browser

## Configuration

### Basic Setup

Edit `.env.local`:

```env
# Dashboard Authentication
DASHBOARD_PASSWORD=your-secure-password

# NextAuth Secret (generate with: openssl rand -base64 32)
NEXTAUTH_SECRET=your-nextauth-secret
NEXTAUTH_URL=http://localhost:3000
```

### Google Calendar Integration

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing
3. Enable the Google Calendar API
4. Create OAuth 2.0 credentials
5. Add authorized redirect URIs
6. Copy credentials to `.env.local`:

```env
GOOGLE_CLIENT_ID=your-client-id
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_REDIRECT_URI=http://localhost:3000/api/auth/callback
GOOGLE_REFRESH_TOKEN=your-refresh-token
```

### Gmail Integration

Follow the same steps as Calendar, but also enable the Gmail API in Google Cloud Console.

### Market Data API

Choose your provider:

**Finnhub** (Recommended - generous free tier):
1. Sign up at [finnhub.io](https://finnhub.io)
2. Get your API key
3. Add to `.env.local`:
```env
FINNHUB_API_KEY=your-api-key
MARKET_DATA_PROVIDER=finnhub
```

**Alpha Vantage**:
1. Get API key at [alphavantage.co](https://www.alphavantage.co/support/#api-key)
2. Add to `.env.local`:
```env
ALPHA_VANTAGE_API_KEY=your-api-key
MARKET_DATA_PROVIDER=alphavantage
```

## API Routes

| Route | Method | Description |
|-------|--------|-------------|
| `/api/cron-status` | GET | List active cron jobs |
| `/api/calendar-events` | GET | Fetch upcoming calendar events |
| `/api/market-data` | GET | Get current market prices |
| `/api/habit-status` | GET | Get habit tracking data |
| `/api/run-cron` | POST | Trigger a specific cron job |
| `/api/create-event` | POST | Create a new calendar event |

### API Examples

**Get cron jobs:**
```bash
curl http://localhost:3000/api/cron-status
```

**Trigger a cron job:**
```bash
curl -X POST http://localhost:3000/api/run-cron \
  -H "Content-Type: application/json" \
  -d '{"jobId": "1"}'
```

**Create calendar event:**
```bash
curl -X POST http://localhost:3000/api/create-event \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Team Meeting",
    "description": "Weekly sync",
    "startDate": "2024-01-20T10:00:00Z",
    "endDate": "2024-01-20T11:00:00Z"
  }'
```

## Deployment

### Vercel (Recommended)

1. Push your code to GitHub
2. Import project in [Vercel](https://vercel.com)
3. Add environment variables in Vercel dashboard
4. Deploy!

### Docker

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN npm run build
EXPOSE 3000
CMD ["npm", "start"]
```

Build and run:
```bash
docker build -t juno-dashboard .
docker run -p 3000:3000 --env-file .env.local juno-dashboard
```

## Customization

### Adding New Widgets

1. Create a new component in `components/`
2. Add it to the grid in `app/page.tsx`
3. Create corresponding API route in `app/api/`

### Theming

Edit CSS variables in `app/globals.css`:

```css
:root {
  --background: #0d1117;
  --foreground: #e6edf3;
  --tangerine: #ff6b35;
  /* ... */
}
```

### Cron Jobs

To integrate real cron jobs, modify `app/api/cron-status/route.ts` and `app/api/run-cron/route.ts` to connect to your actual cron system (e.g., node-cron, system crontab, or external service).

## Project Structure

```
juno-dashboard/
├── app/
│   ├── page.tsx              # Main dashboard
│   ├── layout.tsx            # Root layout
│   ├── globals.css           # Global styles
│   └── api/                  # API routes
├── components/               # React components
├── lib/                      # Utility functions
├── public/                   # Static assets
├── .env.local.example        # Environment template
└── README.md
```

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

MIT License - see LICENSE file for details

## Credits

Built with ❤️ using Next.js, Tailwind CSS, and Lucide Icons.
