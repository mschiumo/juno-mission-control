import { NextResponse } from 'next/server';

const STRAVA_API_BASE = 'https://www.strava.com/api/v3';

interface StravaTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_at: number;
}

interface StravaActivity {
  id: number;
  name: string;
  type: string;
  distance: number; // meters
  moving_time: number; // seconds
  elapsed_time: number;
  total_elevation_gain: number; // meters
  start_date: string;
  average_speed: number;
  max_speed: number;
  average_heartrate?: number;
  max_heartrate?: number;
  calories?: number;
}

// Token cache
let cachedToken: string | null = null;
let tokenExpiry: number = 0;

async function getAccessToken(): Promise<string | null> {
  // DEBUG: Log env var status
  console.log('Strava env check:', {
    hasClientId: !!process.env.STRAVA_CLIENT_ID,
    hasClientSecret: !!process.env.STRAVA_CLIENT_SECRET,
    hasRefreshToken: !!process.env.STRAVA_REFRESH_TOKEN,
    clientId: process.env.STRAVA_CLIENT_ID?.substring(0, 4) + '...',
  });

  // Return cached token if still valid (with 5 min buffer)
  if (cachedToken && Date.now() / 1000 < tokenExpiry - 300) {
    return cachedToken;
  }

  const clientId = process.env.STRAVA_CLIENT_ID;
  const clientSecret = process.env.STRAVA_CLIENT_SECRET;
  const refreshToken = process.env.STRAVA_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    console.error('Strava credentials not configured - missing:', {
      hasClientId: !!clientId,
      hasClientSecret: !!clientSecret,
      hasRefreshToken: !!refreshToken,
      clientIdValue: clientId,
      clientSecretLength: clientSecret?.length,
      refreshTokenLength: refreshToken?.length,
    });
    // DEBUG: Return detailed error instead of null
    throw new Error(`Missing credentials: clientId=${!!clientId}, secret=${!!clientSecret}, refresh=${!!refreshToken}`);
  }

  try {
    const response = await fetch(`${STRAVA_API_BASE}/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    });

    if (!response.ok) {
      throw new Error(`Token refresh failed: ${response.status}`);
    }

    const data: StravaTokenResponse = await response.json();
    cachedToken = data.access_token;
    tokenExpiry = data.expires_at;

    return cachedToken;
  } catch (error) {
    console.error('Failed to refresh Strava token:', error);
    // DEBUG: Throw error instead of returning null
    throw new Error(`Token refresh failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export async function GET(request: Request) {
  try {
    const accessToken = await getAccessToken();

    if (!accessToken) {
      return NextResponse.json({
        success: false,
        error: 'Strava not configured',
        message: 'Please set STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET, and STRAVA_REFRESH_TOKEN environment variables',
        debug: {
          hasClientId: !!process.env.STRAVA_CLIENT_ID,
          hasClientSecret: !!process.env.STRAVA_CLIENT_SECRET,
          hasRefreshToken: !!process.env.STRAVA_REFRESH_TOKEN,
          clientIdPreview: process.env.STRAVA_CLIENT_ID?.substring(0, 4),
        }
      }, { status: 503 });
    }

    // Parse query params
    const { searchParams } = new URL(request.url);
    const days = parseInt(searchParams.get('days') || '7', 10);
    const activityType = searchParams.get('type') || 'all'; // run, ride, workout, all

    // Calculate after timestamp (activities after this date)
    const after = Math.floor(Date.now() / 1000) - (days * 24 * 60 * 60);

    // Fetch activities
    const response = await fetch(
      `${STRAVA_API_BASE}/athlete/activities?after=${after}&per_page=100`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Strava API error: ${response.status}`);
    }

    let activities: StravaActivity[] = await response.json();

    // Filter by activity type if specified
    if (activityType !== 'all') {
      activities = activities.filter(
        (a) => a.type.toLowerCase() === activityType.toLowerCase()
      );
    }

    // Calculate stats
    const stats = {
      totalActivities: activities.length,
      totalDistance: activities.reduce((sum, a) => sum + a.distance, 0),
      totalTime: activities.reduce((sum, a) => sum + a.moving_time, 0),
      totalElevation: activities.reduce((sum, a) => sum + a.total_elevation_gain, 0),
      totalCalories: activities.reduce((sum, a) => sum + (a.calories || 0), 0),
      runs: activities.filter((a) => a.type === 'Run').length,
      rides: activities.filter((a) => a.type === 'Ride').length,
      workouts: activities.filter((a) => 
        ['Workout', 'WeightTraining', 'Crossfit'].includes(a.type)
      ).length,
    };

    // Format activities for display
    const formattedActivities = activities.map((a) => ({
      id: a.id,
      name: a.name,
      type: a.type,
      distance: `${(a.distance / 1000).toFixed(2)} km`,
      duration: formatDuration(a.moving_time),
      elevation: `${Math.round(a.total_elevation_gain)} m`,
      date: new Date(a.start_date).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
      }),
      avgHr: a.average_heartrate,
      calories: a.calories,
    }));

    return NextResponse.json({
      success: true,
      data: {
        stats,
        activities: formattedActivities,
      },
      period: `${days} days`,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Strava API error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch Strava data',
      message: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  
  if (hours > 0) {
    return `${hours}h ${mins}m`;
  }
  return `${mins}m`;
}
