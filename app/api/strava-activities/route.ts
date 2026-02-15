import { NextResponse } from 'next/server';
import { getValidAccessToken } from '@/lib/strava-auth';

// Strava Activity type
interface StravaActivity {
  id: number;
  name: string;
  type: string;
  sport_type: string;
  start_date: string;
  start_date_local: string;
  distance: number; // meters
  moving_time: number; // seconds
  elapsed_time: number; // seconds
  total_elevation_gain: number; // meters
  average_speed: number; // m/s
  max_speed: number; // m/s
  average_heartrate?: number;
  max_heartrate?: number;
  average_watts?: number;
  max_watts?: number;
  kilojoules?: number;
  calories?: number;
  has_heartrate: boolean;
  has_watts: boolean;
  map?: {
    summary_polyline: string | null;
  };
  gear_id: string | null;
}

interface ActivitySummary {
  id: number;
  name: string;
  type: string;
  sportType: string;
  date: string;
  distance: number; // miles
  duration: number; // minutes
  elevation: number; // feet
  avgSpeed: number; // mph
  maxSpeed: number; // mph
  avgHeartrate?: number;
  maxHeartrate?: number;
  avgWatts?: number;
  maxWatts?: number;
  calories?: number;
  hasHeartrate: boolean;
  hasPower: boolean;
}

// Convert meters to miles
function metersToMiles(meters: number): number {
  return meters * 0.000621371;
}

// Convert m/s to mph
function msToMph(ms: number): number {
  return ms * 2.23694;
}

// Convert meters to feet
function metersToFeet(meters: number): number {
  return meters * 3.28084;
}

// Format duration from seconds to HH:MM:SS or MM:SS
function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

// Format relative time (e.g., "2 hours ago")
function getRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 60) {
    return `${diffMins} minute${diffMins !== 1 ? 's' : ''} ago`;
  } else if (diffHours < 24) {
    return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
  } else if (diffDays < 7) {
    return `${diffDays} day${diffDays !== 1 ? 's' : ''} ago`;
  } else {
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
}

export async function GET(request: Request) {
  try {
    // Check if Strava is configured
    const hasStravaConfig = process.env.STRAVA_CLIENT_ID && 
                           process.env.STRAVA_CLIENT_SECRET && 
                           process.env.STRAVA_REFRESH_TOKEN;
    
    if (!hasStravaConfig) {
      return NextResponse.json({
        success: false,
        error: 'Strava not configured',
        message: 'Add STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET, and STRAVA_REFRESH_TOKEN to your environment variables',
        activities: [],
        stats: null
      }, { status: 503 });
    }

    // Get a valid access token (will refresh if needed)
    const accessToken = await getValidAccessToken();
    
    if (!accessToken) {
      return NextResponse.json({
        success: false,
        error: 'Authentication failed',
        message: 'Unable to obtain valid Strava access token. Check your credentials.',
        activities: [],
        stats: null
      }, { status: 401 });
    }

    // Parse query parameters
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '10', 10);
    const days = parseInt(searchParams.get('days') || '30', 10);
    
    // Calculate after timestamp (activities after this date)
    const afterTimestamp = Math.floor(Date.now() / 1000) - (days * 24 * 60 * 60);

    // Fetch activities from Strava API
    console.log(`Fetching Strava activities (limit: ${limit}, days: ${days})...`);
    
    const response = await fetch(
      `https://www.strava.com/api/v3/athlete/activities?after=${afterTimestamp}&per_page=${limit}`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        },
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Strava API error:', response.status, errorText);
      
      // Handle specific error cases
      if (response.status === 401) {
        return NextResponse.json({
          success: false,
          error: 'Authentication expired',
          message: 'Strava token expired and refresh failed. Please re-authenticate.',
          activities: [],
          stats: null
        }, { status: 401 });
      }
      
      return NextResponse.json({
        success: false,
        error: 'Strava API error',
        message: `Failed to fetch activities: ${response.status}`,
        activities: [],
        stats: null
      }, { status: response.status });
    }

    const activities: StravaActivity[] = await response.json();
    
    // Transform activities to our format
    const formattedActivities: ActivitySummary[] = activities.map(activity => ({
      id: activity.id,
      name: activity.name,
      type: activity.type,
      sportType: activity.sport_type,
      date: activity.start_date,
      distance: metersToMiles(activity.distance),
      duration: Math.round(activity.moving_time / 60), // minutes
      elevation: metersToFeet(activity.total_elevation_gain),
      avgSpeed: msToMph(activity.average_speed),
      maxSpeed: msToMph(activity.max_speed),
      avgHeartrate: activity.average_heartrate,
      maxHeartrate: activity.max_heartrate,
      avgWatts: activity.average_watts,
      maxWatts: activity.max_watts,
      calories: activity.calories,
      hasHeartrate: activity.has_heartrate,
      hasPower: activity.has_watts,
    }));

    // Calculate stats
    const stats = {
      totalActivities: formattedActivities.length,
      totalDistance: formattedActivities.reduce((sum, a) => sum + a.distance, 0),
      totalDuration: formattedActivities.reduce((sum, a) => sum + a.duration, 0),
      totalElevation: formattedActivities.reduce((sum, a) => sum + a.elevation, 0),
      totalCalories: formattedActivities.reduce((sum, a) => sum + (a.calories || 0), 0),
      activitiesWithHeartrate: formattedActivities.filter(a => a.hasHeartrate).length,
      activitiesWithPower: formattedActivities.filter(a => a.hasPower).length,
    };

    // Group by activity type
    const byType: Record<string, number> = {};
    formattedActivities.forEach(activity => {
      byType[activity.type] = (byType[activity.type] || 0) + 1;
    });

    return NextResponse.json({
      success: true,
      activities: formattedActivities,
      stats: {
        ...stats,
        byType,
      },
      lastUpdated: new Date().toISOString(),
    });

  } catch (error) {
    console.error('Strava activities API error:', error);
    return NextResponse.json({
      success: false,
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
      activities: [],
      stats: null
    }, { status: 500 });
  }
}

// POST endpoint to log activities to the activity log
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action, details } = body;

    // Forward to activity log API
    const response = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || ''}/api/activity-log`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: action || 'Strava activity logged',
        details: details || '',
        type: 'api'
      }),
    });

    if (!response.ok) {
      throw new Error('Failed to log to activity log');
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error logging Strava activity:', error);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}
