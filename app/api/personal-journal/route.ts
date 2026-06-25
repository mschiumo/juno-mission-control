import { NextRequest, NextResponse } from 'next/server';
import { getRedisClient } from '@/lib/redis';
import { requireUserId } from '@/lib/auth-session';
import type { GoalReview } from '@/lib/journal-prompts';

// Personal (mindset/goals) daily journal — kept in its own namespace, fully
// separate from the trading `daily-journal:` store used by the Trading Journal.
function personalJournalKey(userId: string, date: string) {
  return `personal-journal:${userId}:${date}`;
}

function personalJournalPrefix(userId: string) {
  return `personal-journal:${userId}:`;
}

export interface JournalPrompt {
  id: string;
  question: string;
  answer: string;
}

export interface PersonalJournalEntry {
  id: string;
  date: string;
  prompts: JournalPrompt[];
  goalReviews: GoalReview[];
  createdAt: string;
  updatedAt: string;
}

export async function POST(request: NextRequest) {
  const { userId, error: authError } = await requireUserId();
  if (authError) return authError;

  try {
    const body = await request.json();
    const { date, prompts, goalReviews } = body;

    if (!date) {
      return NextResponse.json(
        { success: false, error: 'Date is required' },
        { status: 400 }
      );
    }

    const redis = await getRedisClient();
    const key = personalJournalKey(userId, date);
    const now = new Date().toISOString();

    // Check if entry exists
    const existing = await redis.hGetAll(key);

    const entry: PersonalJournalEntry = {
      id: key,
      date,
      prompts: prompts || [],
      goalReviews: goalReviews || [],
      createdAt: existing.createdAt || now,
      updatedAt: now
    };

    await redis.hSet(key, {
      id: entry.id,
      date: entry.date,
      prompts: JSON.stringify(entry.prompts),
      goalReviews: JSON.stringify(entry.goalReviews),
      createdAt: entry.createdAt,
      updatedAt: entry.updatedAt
    });

    return NextResponse.json({
      success: true,
      message: existing.createdAt ? 'Journal entry updated' : 'Journal entry created',
      entry
    });

  } catch (error) {
    console.error('Error saving personal journal:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to save journal entry'
      },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  const { userId, error: authError } = await requireUserId();
  if (authError) return authError;

  try {
    const { searchParams } = new URL(request.url);
    const date = searchParams.get('date');

    const redis = await getRedisClient();

    if (date) {
      // Get specific date
      const data = await redis.hGetAll(personalJournalKey(userId, date));

      if (!data || !data.id) {
        return NextResponse.json({
          success: true,
          entry: null,
          date
        });
      }

      return NextResponse.json({
        success: true,
        entry: {
          id: data.id,
          date: data.date,
          prompts: JSON.parse(data.prompts || '[]'),
          goalReviews: JSON.parse(data.goalReviews || '[]'),
          createdAt: data.createdAt,
          updatedAt: data.updatedAt
        } as PersonalJournalEntry
      });
    }

    // Get all journal entries
    const prefix = personalJournalPrefix(userId);
    const keys = await redis.keys(`${prefix}*`);
    const entries: PersonalJournalEntry[] = [];

    for (const key of keys) {
      const data = await redis.hGetAll(key);
      if (data && data.id) {
        entries.push({
          id: data.id,
          date: data.date,
          prompts: JSON.parse(data.prompts || '[]'),
          goalReviews: JSON.parse(data.goalReviews || '[]'),
          createdAt: data.createdAt,
          updatedAt: data.updatedAt
        });
      }
    }

    // Sort by date descending
    entries.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    return NextResponse.json({
      success: true,
      entries,
      count: entries.length
    });

  } catch (error) {
    console.error('Error fetching personal journal:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch journal entries'
      },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  const { userId, error: authError } = await requireUserId();
  if (authError) return authError;

  try {
    const { searchParams } = new URL(request.url);
    const date = searchParams.get('date');

    if (!date) {
      return NextResponse.json(
        { success: false, error: 'Date is required' },
        { status: 400 }
      );
    }

    const redis = await getRedisClient();
    await redis.del(personalJournalKey(userId, date));

    return NextResponse.json({
      success: true,
      message: 'Journal entry deleted'
    });

  } catch (error) {
    console.error('Error deleting personal journal:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to delete journal entry'
      },
      { status: 500 }
    );
  }
}
