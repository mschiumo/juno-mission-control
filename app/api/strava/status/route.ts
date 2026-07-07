import { NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth-session';
import { getTokens, deleteTokens } from '@/lib/strava';

// GET → is Strava connected for this user (and as whom)?
export async function GET() {
  const { userId, error } = await requireUserId();
  if (error) return error;

  try {
    const tokens = await getTokens(userId);
    if (!tokens) return NextResponse.json({ success: true, connected: false });
    return NextResponse.json({
      success: true,
      connected: true,
      athlete: { id: tokens.athlete_id, name: tokens.athlete_name },
      configured: !!process.env.STRAVA_CLIENT_ID,
    });
  } catch (err) {
    console.error('Strava status error:', err);
    return NextResponse.json({ success: false, error: 'Failed to read Strava status' }, { status: 500 });
  }
}

// DELETE → disconnect (revoke at Strava, then drop stored tokens).
export async function DELETE() {
  const { userId, error } = await requireUserId();
  if (error) return error;

  try {
    const tokens = await getTokens(userId);
    if (tokens) {
      // Best-effort deauthorize; local disconnect still proceeds if it fails.
      try {
        await fetch('https://www.strava.com/oauth/deauthorize', {
          method: 'POST',
          headers: { Authorization: `Bearer ${tokens.access_token}` },
        });
      } catch {
        /* ignore */
      }
      await deleteTokens(userId);
    }
    return NextResponse.json({ success: true, connected: false });
  } catch (err) {
    console.error('Strava disconnect error:', err);
    return NextResponse.json({ success: false, error: 'Failed to disconnect Strava' }, { status: 500 });
  }
}
