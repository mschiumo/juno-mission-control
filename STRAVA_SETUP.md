# Strava API Integration Setup

## Required Environment Variables

Add these to your Vercel project settings:

### 1. STRAVA_CLIENT_ID
- Get from: https://www.strava.com/settings/api
- Create an application at Strava → Settings → My API Application
- Copy the **Client ID**

### 2. STRAVA_CLIENT_SECRET
- Same location as above
- Copy the **Client Secret**

### 3. STRAVA_REFRESH_TOKEN
- This requires OAuth authorization (one-time setup)
- Steps:
  1. Visit: `https://www.strava.com/oauth/authorize?client_id=YOUR_CLIENT_ID&response_type=code&redirect_uri=http://localhost&approval_prompt=force&scope=read,activity:read`
  2. Authorize the app
  3. Copy the `code` from the URL
  4. Exchange code for tokens using curl:
     ```bash
     curl -X POST https://www.strava.com/oauth/token \
       -d client_id=YOUR_CLIENT_ID \
       -d client_secret=YOUR_CLIENT_SECRET \
       -d code=CODE_FROM_URL \
       -d grant_type=authorization_code
     ```
  5. Save the `refresh_token` (lasts forever)

### 4. STRAVA_ACCESS_TOKEN (Optional)
- Will be auto-generated from refresh token
- Can leave empty initially

## Strava API Limits
- 200 requests per 15 minutes
- 2,000 requests per day
- Perfect for daily/hourly sync

## Scopes Needed
- `read` - Basic athlete info
- `activity:read` - Read activities

## Features Implemented
- Fetch recent activities
- Weekly stats (distance, time, elevation)
- Activity type filtering (run, ride, workout)
- Goal tracking integration
