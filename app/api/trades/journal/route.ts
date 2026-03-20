import { NextRequest, NextResponse } from 'next/server';
import { getRedisClient } from '@/lib/redis';
import { getNowInEST } from '@/lib/date-utils';
import { requireUserId } from '@/lib/auth-session';

function journalKey(userId: string, date: string) {
  return `journal:${userId}:${date}`;
}

function journalKeyPrefix(userId: string) {
  return `journal:${userId}:`;
}

export async function POST(request: NextRequest) {
  const { userId, error: authError } = await requireUserId();
  if (authError) return authError;

  try {
    const body = await request.json();
    const { date, notes } = body;

    if (!date) {
      return NextResponse.json(
        { success: false, error: 'Date is required' },
        { status: 400 }
      );
    }

    const redis = await getRedisClient();
    const key = journalKey(userId, date);

    await redis.hSet(key, {
      date,
      notes: notes || '',
      updatedAt: getNowInEST()
    });

    return NextResponse.json({
      success: true,
      message: 'Journal saved successfully'
    });

  } catch (error) {
    console.error('Error saving journal:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to save journal'
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
      const data = await redis.hGetAll(journalKey(userId, date));
      return NextResponse.json({
        success: true,
        date,
        notes: data.notes || '',
        hasJournal: !!data.notes
      });
    }

    // Get all journals (scan for keys)
    const prefix = journalKeyPrefix(userId);
    const keys = await redis.keys(`${prefix}*`);
    const journals: Record<string, string> = {};

    for (const key of keys) {
      const data = await redis.hGetAll(key);
      const dateKey = key.replace(prefix, '');
      if (data.notes) {
        journals[dateKey] = data.notes;
      }
    }

    return NextResponse.json({
      success: true,
      journals
    });

  } catch (error) {
    console.error('Error fetching journal:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch journal'
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
    await redis.del(journalKey(userId, date));

    return NextResponse.json({
      success: true,
      message: 'Journal deleted'
    });

  } catch (error) {
    console.error('Error deleting journal:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to delete journal'
      },
      { status: 500 }
    );
  }
}
