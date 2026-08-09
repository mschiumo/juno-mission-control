/**
 * Profile avatars.
 *
 * GET    — the signed-in user's avatar bytes (404 when none; clients fall
 *          back to the initial-letter badge).
 * POST   { dataUrl } — set the avatar. The client downscales to 256px JPEG
 *          before upload; the server re-validates format and size anyway.
 * DELETE — remove the avatar.
 *
 * Stored in Redis as a data URL at user:avatar:{userId} — at a ~200KB cap
 * and current scale this is a few MB total, which beats wiring up blob
 * storage for one feature. Revisit if avatars ever grow teeth.
 */

import { NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth-session';
import { getRedisClient } from '@/lib/redis';

const MAX_DATA_URL_BYTES = 200 * 1024;
const DATA_URL_RE = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/;

function avatarKey(userId: string): string {
  return `user:avatar:${userId}`;
}

export async function GET(): Promise<Response> {
  const authResult = await requireUserId();
  if (authResult.error) return authResult.error;

  const redis = await getRedisClient();
  const dataUrl = await redis.get(avatarKey(authResult.userId));
  const match = typeof dataUrl === 'string' ? dataUrl.match(DATA_URL_RE) : null;
  if (!match) {
    return NextResponse.json({ success: false, error: 'No avatar' }, { status: 404 });
  }
  return new Response(Buffer.from(match[2], 'base64'), {
    headers: {
      'Content-Type': `image/${match[1]}`,
      // Private and always revalidated: a fresh upload must show on next load.
      'Cache-Control': 'private, no-cache',
    },
  });
}

export async function POST(request: Request): Promise<NextResponse> {
  const authResult = await requireUserId();
  if (authResult.error) return authResult.error;

  let dataUrl = '';
  try {
    const body = await request.json();
    dataUrl = typeof body?.dataUrl === 'string' ? body.dataUrl : '';
  } catch {
    // handled below
  }
  if (!DATA_URL_RE.test(dataUrl)) {
    return NextResponse.json(
      { success: false, error: 'Avatar must be a JPEG, PNG, or WebP image.' },
      { status: 400 },
    );
  }
  if (dataUrl.length > MAX_DATA_URL_BYTES) {
    return NextResponse.json(
      { success: false, error: 'Avatar is too large — try a smaller image.' },
      { status: 413 },
    );
  }

  const redis = await getRedisClient();
  await redis.set(avatarKey(authResult.userId), dataUrl);
  return NextResponse.json({ success: true });
}

export async function DELETE(): Promise<NextResponse> {
  const authResult = await requireUserId();
  if (authResult.error) return authResult.error;

  const redis = await getRedisClient();
  await redis.del(avatarKey(authResult.userId));
  return NextResponse.json({ success: true });
}
