import { NextRequest, NextResponse } from 'next/server';
import { getRedisClient } from '@/lib/redis';
import { requireUserId } from '@/lib/auth-session';
import Anthropic from '@anthropic-ai/sdk';

interface JournalPrompt {
  id: string;
  question: string;
  answer: string;
}

interface JournalEntry {
  id: string;
  date: string;
  prompts: JournalPrompt[];
  createdAt: string;
  updatedAt: string;
}

interface Trade {
  id: string;
  symbol: string;
  side: string;
  status: string;
  entryDate: string;
  exitDate?: string;
  netPnL?: number;
  emotion?: string;
  setupQuality?: string;
  mistakes?: string[];
  lessons?: string[];
  strategy?: string;
}

function getDateRange(period: string): { start: Date; end: Date } {
  const now = new Date();
  const end = new Date(now);
  const start = new Date(now);

  if (period === 'week') {
    // Go back to most recent Monday
    const day = start.getDay();
    const diff = day === 0 ? 6 : day - 1;
    start.setDate(start.getDate() - diff);
  } else {
    // month — first day of current month
    start.setDate(1);
  }
  start.setHours(0, 0, 0, 0);
  end.setHours(23, 59, 59, 999);

  return { start, end };
}

function buildStructuredSummary(
  entries: JournalEntry[],
  trades: Trade[],
): string {
  const lines: string[] = [];

  // Journal entries
  lines.push(`## Journal Entries (${entries.length} total)\n`);
  for (const entry of entries) {
    lines.push(`### ${entry.date}`);
    for (const prompt of entry.prompts) {
      if (prompt.answer?.trim()) {
        lines.push(`**${prompt.question}**`);
        lines.push(prompt.answer.trim());
      }
    }
    lines.push('');
  }

  // Trade summary
  const closed = trades.filter((t) => t.status === 'CLOSED');
  if (closed.length > 0) {
    lines.push(`## Trade Data (${closed.length} closed trades)\n`);

    const wins = closed.filter((t) => (t.netPnL || 0) > 0).length;
    const losses = closed.filter((t) => (t.netPnL || 0) < 0).length;
    const totalPnL = closed.reduce((s, t) => s + (t.netPnL || 0), 0);
    lines.push(`- Win/Loss: ${wins}W / ${losses}L`);
    lines.push(`- Net P&L: $${totalPnL.toFixed(2)}`);

    // Emotion breakdown
    const emotions: Record<string, number> = {};
    for (const t of closed) {
      if (t.emotion) emotions[t.emotion] = (emotions[t.emotion] || 0) + 1;
    }
    if (Object.keys(emotions).length > 0) {
      lines.push(`- Emotions logged: ${Object.entries(emotions).map(([e, c]) => `${e}(${c})`).join(', ')}`);
    }

    // Setup quality breakdown
    const qualities: Record<string, number> = {};
    for (const t of closed) {
      if (t.setupQuality) qualities[t.setupQuality] = (qualities[t.setupQuality] || 0) + 1;
    }
    if (Object.keys(qualities).length > 0) {
      lines.push(`- Setup quality: ${Object.entries(qualities).map(([q, c]) => `${q}(${c})`).join(', ')}`);
    }

    // Mistakes
    const allMistakes: string[] = [];
    for (const t of closed) {
      if (t.mistakes?.length) allMistakes.push(...t.mistakes);
    }
    if (allMistakes.length > 0) {
      const freq: Record<string, number> = {};
      for (const m of allMistakes) freq[m] = (freq[m] || 0) + 1;
      const sorted = Object.entries(freq).sort((a, b) => b[1] - a[1]);
      lines.push(`- Recorded mistakes: ${sorted.map(([m, c]) => `"${m}"(${c}x)`).join(', ')}`);
    }

    // Lessons
    const allLessons: string[] = [];
    for (const t of closed) {
      if (t.lessons?.length) allLessons.push(...t.lessons);
    }
    if (allLessons.length > 0) {
      lines.push(`- Lessons noted: ${allLessons.map((l) => `"${l}"`).join(', ')}`);
    }
  }

  return lines.join('\n');
}

export async function POST(request: NextRequest) {
  const { userId, error: authError } = await requireUserId();
  if (authError) return authError;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { success: false, error: 'ANTHROPIC_API_KEY is not configured' },
      { status: 500 },
    );
  }

  try {
    const body = await request.json();
    const period: string = body.period || 'week';
    const { start, end } = getDateRange(period);

    const redis = await getRedisClient();

    // Fetch all journal entries
    const journalKeys = await redis.keys(`daily-journal:${userId}:*`);
    const entries: JournalEntry[] = [];

    for (const key of journalKeys) {
      const data = await redis.hGetAll(key);
      if (!data?.id) continue;

      const entryDate = new Date(data.date + 'T12:00:00');
      if (entryDate >= start && entryDate <= end) {
        entries.push({
          id: data.id,
          date: data.date,
          prompts: JSON.parse(data.prompts || '[]'),
          createdAt: data.createdAt,
          updatedAt: data.updatedAt,
        });
      }
    }

    entries.sort((a, b) => a.date.localeCompare(b.date));

    // Fetch trades for period
    const tradesRes = await fetch(
      `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/trades?userId=${userId}&perPage=1000`,
      { headers: { cookie: request.headers.get('cookie') || '' } },
    );
    const tradesData = await tradesRes.json();
    const allTrades: Trade[] = tradesData?.data?.trades || [];

    const periodTrades = allTrades.filter((t) => {
      const d = new Date(t.exitDate || t.entryDate);
      return d >= start && d <= end;
    });

    if (entries.length === 0 && periodTrades.length === 0) {
      return NextResponse.json({
        success: true,
        analysis: null,
        message: `No journal entries or trades found for this ${period}.`,
        period,
        entriesCount: 0,
        tradesCount: 0,
      });
    }

    // Build context for Claude
    const context = buildStructuredSummary(entries, periodTrades);
    const periodLabel = period === 'week' ? 'this week' : 'this month';

    const client = new Anthropic({ apiKey });

    const message = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1500,
      messages: [
        {
          role: 'user',
          content: `You are a trading performance coach analyzing a trader's journal entries and trade data from ${periodLabel}.

Analyze the following data and provide actionable insights. Focus on:
1. **Recurring Patterns** — emotions, behaviors, or mistakes that appear repeatedly
2. **What's Working** — positive patterns and strengths to maintain
3. **Areas for Improvement** — specific, actionable suggestions
4. **Emotion-Performance Link** — how emotional states correlate with trading outcomes
5. **Key Takeaway** — one sentence the trader should remember going into next ${period}

Keep your response concise and direct. Use short paragraphs. Do not use bullet point headers like "Recurring Patterns:" — weave the insights naturally. Avoid generic advice — be specific to what you see in the data.

If there's limited data, acknowledge it and work with what's available.

---

${context}`,
        },
      ],
    });

    const analysisText =
      message.content[0].type === 'text' ? message.content[0].text : '';

    return NextResponse.json({
      success: true,
      analysis: analysisText,
      period,
      entriesCount: entries.length,
      tradesCount: periodTrades.filter((t) => t.status === 'CLOSED').length,
    });
  } catch (error) {
    console.error('Error generating journal insights:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to generate insights',
      },
      { status: 500 },
    );
  }
}
