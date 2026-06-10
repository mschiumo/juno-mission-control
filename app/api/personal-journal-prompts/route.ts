import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { getRedisClient } from '@/lib/redis';
import { requireUserId } from '@/lib/auth-session';
import { DEFAULT_TEXT_PROMPTS, type PromptDef } from '@/lib/journal-prompts';

// Per-user configurable reflection prompts for the personal journal.
function promptsKey(userId: string) {
  return `personal-journal-prompts:${userId}`;
}

// GET — the user's text prompts (defaults until they customize).
export async function GET() {
  const { userId, error } = await requireUserId();
  if (error) return error;

  try {
    const redis = await getRedisClient();
    const raw = await redis.get(promptsKey(userId));
    const prompts: PromptDef[] = raw ? JSON.parse(raw) : DEFAULT_TEXT_PROMPTS;
    return NextResponse.json({ success: true, prompts });
  } catch (err) {
    console.error('Error fetching journal prompts:', err);
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'Failed to fetch prompts' },
      { status: 500 },
    );
  }
}

// PUT — replace the user's text prompts with the provided list.
export async function PUT(request: NextRequest) {
  const { userId, error } = await requireUserId();
  if (error) return error;

  try {
    const body = await request.json();
    const incoming: unknown[] = Array.isArray(body.prompts) ? body.prompts : [];

    const prompts: PromptDef[] = incoming
      .map((p) => p as { id?: unknown; question?: unknown })
      .filter((p) => typeof p.question === 'string' && p.question.trim())
      .map((p) => ({
        id: typeof p.id === 'string' && p.id.trim() ? p.id.trim() : randomUUID(),
        question: (p.question as string).trim(),
      }));

    const redis = await getRedisClient();
    await redis.set(promptsKey(userId), JSON.stringify(prompts));

    return NextResponse.json({ success: true, prompts });
  } catch (err) {
    console.error('Error saving journal prompts:', err);
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'Failed to save prompts' },
      { status: 500 },
    );
  }
}
