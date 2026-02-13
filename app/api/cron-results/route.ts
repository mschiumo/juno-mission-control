import { NextResponse } from 'next/server';

// In-memory storage for cron job results (in production, use a database)
interface CronResult {
  id: string;
  jobName: string;
  timestamp: string;
  content: string;
  type: 'market' | 'motivational' | 'check-in' | 'review';
}

// Sample data for today's runs
const cronResults: CronResult[] = [
  {
    id: '1',
    jobName: 'Morning Market Briefing',
    timestamp: '2026-02-13T13:00:00Z',
    type: 'market',
    content: `📊 **Morning Market Briefing — Feb 13, 2026**

**US Index Futures**
• S&P 500: 6,125 (+0.8%)
• Nasdaq: 21,890 (+1.2%)
• Dow: 44,150 (+0.6%)

**Crypto**
• BTC: $68,829 (+4.8%) 🚀
• ETH: $2,054 (+6.9%) 🚀
• SOL: $83.97 (+8.7%) 🚀

**Key News:**
• CPI came in cooler than expected (2.4% vs 2.5%)
• Fed rate cut expectations ticking up
• Risk-on rally in crypto

**Gap Scanner:**
📈 BULLISH: NVDA +3%, PLTR +5%, TSLA +2%
📉 BEARISH: AAPL -2%, META -1%

Ready to crush today! 💪`
  },
  {
    id: '2',
    jobName: 'Daily Motivational',
    timestamp: '2026-02-13T12:00:00Z',
    type: 'motivational',
    content: `Good morning! ☀️

"The future belongs to those who believe in the beauty of their dreams." — Eleanor Roosevelt

Here's to chasing yours today. 🚀`
  },
  {
    id: '3',
    jobName: 'Mid-Day Trading Check',
    timestamp: '2026-02-13T17:30:00Z',
    type: 'check-in',
    content: `Hey MJ — mid-day discipline check 🪐

Quick questions:
• Are you trading your plan or your emotions?
• Did you set stops BEFORE entering?
• Are you chasing or waiting for your setups?

Remember: HALT — Hungry, Angry, Lonely, Tired? If yes, step away.

You're a disciplined trader. Trust the process.`
  },
  {
    id: '4',
    jobName: 'Market Close Report',
    timestamp: '2026-02-13T21:30:00Z',
    type: 'market',
    content: `📊 **Market Close — Feb 13, 2026**

**Weekly wrap:**
- S&P 500: **-1.5%** for the week (flat today)
- Tech under pressure — most Mag 7 down
- **Applied Materials +8.1%** (earnings beat) led gainers
- **Crypto:** BTC ~$66.9k, ETH ~$1,990 (slightly lower)

**Key theme:** Softer CPI data gave hope for rate cuts, but AI/datacenter spending concerns kept tech muted.`
  }
];

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const jobName = searchParams.get('jobName');

  if (jobName) {
    // Get latest result for specific job
    const result = cronResults
      .filter(r => r.jobName === jobName)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0];
    
    if (!result) {
      return NextResponse.json({
        success: false,
        error: 'No results found for this job'
      }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      data: result
    });
  }

  // Get all results for today
  const today = new Date().toDateString();
  const todayResults = cronResults.filter(r => 
    new Date(r.timestamp).toDateString() === today
  );

  return NextResponse.json({
    success: true,
    data: todayResults,
    count: todayResults.length
  });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { jobName, content, type } = body;

    if (!jobName || !content) {
      return NextResponse.json({
        success: false,
        error: 'jobName and content are required'
      }, { status: 400 });
    }

    const newResult: CronResult = {
      id: Date.now().toString(),
      jobName,
      timestamp: new Date().toISOString(),
      content,
      type: type || 'check-in'
    };

    cronResults.push(newResult);

    return NextResponse.json({
      success: true,
      data: newResult
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: 'Failed to store result'
    }, { status: 500 });
  }
}