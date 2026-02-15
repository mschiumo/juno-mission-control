# Strava Integration Restoration

## Overview

This document describes the restored Strava integration with proper token persistence using Redis. The previous implementation was removed because Strava returns a NEW refresh token on every token exchange, and the old implementation only cached the access_token in memory, causing 401 errors after 6 hours.

## Architecture

### Token Storage Schema (Redis)

```
Key: strava:tokens
Value: {
  access_token: string,
  refresh_token: string,  // CRITICAL: New token on every refresh!
  expires_at: number,     // Unix timestamp
  athlete_id: number
}
```

### Token Refresh Flow

1. **Check Token Validity**: Before making API calls, check if the access token is expired (with 5-minute buffer)
2. **Refresh if Needed**: If expired, use the refresh token to get a new access token
3. **Persist New Tokens**: Save BOTH the new access token AND the new refresh token to Redis
4. **Proceed with API Call**: Use the valid access token

This flow ensures we never lose the refresh token, which was the root cause of the previous 401 errors.

## Files Created/Modified

### New Files

1. **`lib/strava-auth.ts`** - Authentication utilities
   - `getValidAccessToken()` - Gets a valid token, refreshing if needed
   - `refreshStravaToken()` - Exchanges refresh token for new tokens
   - `saveTokens()` / `getTokens()` - Redis operations
   - `initializeTokensFromEnv()` - Initial setup from env vars

2. **`app/api/strava-activities/route.ts`** - API endpoint
   - GET: Fetch recent activities with stats
   - POST: Log activities to activity log
   - Automatic token refresh handling

3. **`components/StravaCard.tsx`** - UI component
   - Displays recent activities
   - Shows activity stats (distance, time, elevation, calories)
   - Links to Strava activity pages
   - Activity type icons and colors

### Modified Files

1. **`app/page.tsx`** - Added StravaCard to dashboard
2. **`.env.example`** - Added Strava environment variables

## Environment Variables

Add these to your `.env.local`:

```env
## Strava API (for activity tracking)
# Get your API credentials at: https://www.strava.com/settings/api
STRAVA_CLIENT_ID=your_strava_client_id
STRAVA_CLIENT_SECRET=your_strava_client_secret
# Initial refresh token (get from Strava OAuth flow)
STRAVA_REFRESH_TOKEN=your_strava_refresh_token
```

### Getting a Refresh Token

1. Go to https://www.strava.com/settings/api
2. Create an application
3. Use the OAuth flow to get an authorization code:
   ```
   https://www.strava.com/oauth/authorize?
     client_id=YOUR_CLIENT_ID
     &response_type=code
     &redirect_uri=http://localhost
     &approval_prompt=force
     &scope=activity:read_all
   ```
4. Exchange the code for tokens:
   ```bash
   curl -X POST https://www.strava.com/oauth/token \
     -d client_id=YOUR_CLIENT_ID \
     -d client_secret=YOUR_CLIENT_SECRET \
     -d code=AUTHORIZATION_CODE \
     -d grant_type=authorization_code
   ```
5. Save the `refresh_token` from the response

## Testing Checklist

- [ ] Initial token fetch works
- [ ] Token refresh saves new tokens to Redis
- [ ] Subsequent calls use refreshed tokens
- [ ] Error handling for auth failures
- [ ] Graceful degradation when not configured

### Manual Testing Steps

1. **Verify Configuration**
   ```bash
   curl http://localhost:3000/api/debug-env
   ```
   Should show `hasRefreshToken: true`

2. **Test Activity Fetch**
   ```bash
   curl http://localhost:3000/api/strava-activities
   ```
   Should return activities array

3. **Verify Token Persistence**
   ```bash
   redis-cli GET strava:tokens
   ```
   Should show JSON with tokens

4. **Test Token Refresh**
   - Wait 6 hours (or manually expire token in Redis)
   - Make API call again
   - Verify new tokens are saved

## Error Handling

The integration handles these error cases:

1. **Not Configured**: Returns 503 with helpful message
2. **Token Expired**: Automatically refreshes
3. **Refresh Failed**: Returns 401 with re-auth message
4. **Strava API Error**: Returns appropriate status code
5. **Redis Unavailable**: Graceful fallback

## UI Features

The StravaCard component displays:

- **Activity List**: Last 10 activities with:
  - Activity name and type
  - Distance (miles)
  - Duration
  - Average speed (mph)
  - Heart rate (if available)
  - Power (watts, if available)
  - Relative time (e.g., "2h ago")

- **Stats Summary**: For selected time period
  - Total distance
  - Total time
  - Total elevation gain
  - Total calories

- **Activity Types**: Visual indicators for:
  - Ride/Bike (blue)
  - Run (orange)
  - Swim (blue)
  - Hike/Walk (green/yellow)

- **Time Filter**: 7, 30, or 90 days

## Security Considerations

1. Tokens are stored in Redis, not in memory or localStorage
2. Environment variables are never exposed to client
3. API calls are made server-side only
4. Refresh tokens are rotated on every use (Strava's design)

## Future Enhancements

Potential improvements:

- [ ] OAuth flow UI for easier token setup
- [ ] Activity detail view
- [ ] Weekly/monthly trends
- [ ] Goal tracking integration
- [ ] Gear tracking
- [ ] Segment achievements
