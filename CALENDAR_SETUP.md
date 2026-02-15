# Google Calendar Integration Setup

## Required Environment Variables

Add these to Vercel (Settings → Environment Variables):

| Variable | Value | How to Get |
|----------|-------|------------|
| `GOOGLE_CLIENT_ID` | Your OAuth client ID | Google Cloud Console → APIs & Services → Credentials |
| `GOOGLE_CLIENT_SECRET` | Your OAuth client secret | Same as above |
| `GOOGLE_REFRESH_TOKEN` | Long-lived refresh token | OAuth flow (see below) |

## Setup Steps

### 1. Google Cloud Project
1. Go to https://console.cloud.google.com
2. Create new project (or use existing)
3. Enable **Google Calendar API**

### 2. OAuth Credentials
1. APIs & Services → Credentials
2. Click **Create Credentials** → **OAuth client ID**
3. Application type: **Web application**
4. Name: "Juno Mission Control"
5. Authorized redirect URIs: `https://juno-mission-control.vercel.app/api/auth/callback`
6. Save and copy **Client ID** and **Client Secret**

### 3. Get Refresh Token
Run this OAuth flow:

```bash
# Step 1: Visit this URL (replace YOUR_CLIENT_ID):
https://accounts.google.com/o/oauth2/v2/auth?
  client_id=YOUR_CLIENT_ID&
  redirect_uri=https://juno-mission-control.vercel.app/api/auth/callback&
  scope=https://www.googleapis.com/auth/calendar&
  response_type=code&
  access_type=offline&
  prompt=consent

# Step 2: Authorize and copy the "code" from the redirect URL

# Step 3: Exchange code for tokens:
curl -X POST https://oauth2.googleapis.com/token \
  -d "code=CODE_FROM_URL" \
  -d "client_id=YOUR_CLIENT_ID" \
  -d "client_secret=YOUR_CLIENT_SECRET" \
  -d "redirect_uri=https://juno-mission-control.vercel.app/api/auth/callback" \
  -d "grant_type=authorization_code"

# Step 4: Save the refresh_token from the response
```

### 4. Add to Vercel
Add all 3 env vars in Vercel dashboard, then redeploy.

## For Subagents

When creating calendar events:
```typescript
import { createCalendarEvent } from '@/lib/google-calendar';

const event = await createCalendarEvent({
  summary: "Event Title",
  description: "Event description",
  start: { dateTime: "2026-02-20T09:00:00-05:00" },
  end: { dateTime: "2026-02-20T09:30:00-05:00" }
});
```

**Requires:** GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN in env vars.
