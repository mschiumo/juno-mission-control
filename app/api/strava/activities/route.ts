import { NextResponse } from 'next/server';

async function getAccessToken(): Promise<string> {
  const res = await fetch('https://www.strava.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: process.env.STRAVA_CLIENT_ID,
      client_secret: process.env.STRAVA_CLIENT_SECRET,
      refresh_token: process.env.STRAVA_REFRESH_TOKEN,
      grant_type: 'refresh_token',
    }),
    cache: 'no-store',
  });

  if (!res.ok) {
    throw new Error(`Strava token refresh failed: ${res.status}`);
  }

  const data = await res.json();
  return data.access_token;
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function formatPace(metersPerSecond: number): string {
  // min/mile
  const minPerMile = 26.8224 / metersPerSecond;
  const min = Math.floor(minPerMile);
  const sec = Math.round((minPerMile - min) * 60);
  return `${min}:${sec.toString().padStart(2, '0')}/mi`;
}

function metersToMiles(m: number): string {
  return (m / 1609.344).toFixed(2);
}

export async function GET() {
  const missingVars = ['STRAVA_CLIENT_ID', 'STRAVA_CLIENT_SECRET', 'STRAVA_REFRESH_TOKEN'].filter(
    (v) => !process.env[v]
  );
  if (missingVars.length > 0) {
    return NextResponse.json(
      { success: false, error: `Missing env vars: ${missingVars.join(', ')}` },
      { status: 500 }
    );
  }

  try {
    const accessToken = await getAccessToken();

    // Fetch last 5 activities + this week's stats in parallel
    const [activitiesRes, statsRes] = await Promise.all([
      fetch('https://www.strava.com/api/v3/athlete/activities?per_page=5', {
        headers: { Authorization: `Bearer ${accessToken}` },
        next: { revalidate: 300 },
      }),
      fetch('https://www.strava.com/api/v3/athletes/stats', {
        headers: { Authorization: `Bearer ${accessToken}` },
        next: { revalidate: 300 },
      }),
    ]);

    // Get athlete ID for stats endpoint
    const athleteRes = await fetch('https://www.strava.com/api/v3/athlete', {
      headers: { Authorization: `Bearer ${accessToken}` },
      next: { revalidate: 3600 },
    });
    const athlete = await athleteRes.json();

    // Refetch stats with athlete ID
    const statsResWithId = await fetch(
      `https://www.strava.com/api/v3/athletes/${athlete.id}/stats`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
        next: { revalidate: 300 },
      }
    );

    if (!activitiesRes.ok) {
      throw new Error(`Activities fetch failed: ${activitiesRes.status}`);
    }

    const rawActivities = await activitiesRes.json();
    const stats = statsResWithId.ok ? await statsResWithId.json() : null;

    const activities = rawActivities.map((a: Record<string, unknown>) => ({
      id: a.id,
      name: a.name,
      type: a.type,
      distance: metersToMiles(a.distance as number),
      duration: formatDuration(a.moving_time as number),
      pace: (a.type === 'Run' || a.type === 'Walk') && (a.average_speed as number) > 0
        ? formatPace(a.average_speed as number)
        : null,
      elevationGain: Math.round((a.total_elevation_gain as number) * 3.28084), // ft
      date: a.start_date_local,
      kudos: a.kudos_count,
    }));

    const weekStats = stats?.recent_run_totals
      ? {
          runs: stats.recent_run_totals.count,
          miles: metersToMiles(stats.recent_run_totals.distance),
          time: formatDuration(stats.recent_run_totals.moving_time),
        }
      : null;

    return NextResponse.json({
      success: true,
      athlete: {
        name: `${athlete.firstname} ${athlete.lastname}`,
        profile: athlete.profile_medium,
      },
      activities,
      weekStats,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
