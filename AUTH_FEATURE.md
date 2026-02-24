# Gmail OAuth Authentication + Multi-User Support

This feature adds NextAuth.js with Google OAuth to the Juno Mission Control dashboard, requiring users to authenticate before accessing any dashboard content. Additionally, all data is now user-scoped, ensuring complete data isolation between users.

## Changes Summary

### New Files Created

1. **`lib/auth-config.ts`** - NextAuth.js configuration with Google provider
2. **`app/api/auth/[...nextauth]/route.ts`** - API route handlers for authentication
3. **`app/login/page.tsx`** - Login page with Google sign-in button
4. **`middleware.ts`** - Route protection middleware
5. **`components/AuthProvider.tsx`** - Session provider wrapper
6. **`components/UserMenu.tsx`** - User dropdown menu with sign-out
7. **`types/next-auth.d.ts`** - TypeScript type declarations for NextAuth
8. **`types/user.ts`** - User type definitions and helper functions
9. **`lib/db/user-data.ts`** - User-scoped data access helpers with Redis key patterns
10. **`app/api/migrate/route.ts`** - One-time data migration endpoint

### Modified Files

1. **`package.json`** - Added `next-auth@5.0.0-beta.30`
2. **`app/layout.tsx`** - Wrapped with AuthProvider
3. **`app/page.tsx`** - Added UserMenu to header
4. **`.env.example`** - Documented required environment variables
5. **`app/api/trades/*`** - All trade endpoints now user-scoped
6. **`app/api/habits/*`** - All habit endpoints now user-scoped
7. **`app/api/goals/*`** - Goals endpoints now user-scoped
8. **`app/api/daily-journal/*`** - Journal endpoints now user-scoped
9. **`app/api/activity-log/*`** - Activity log now user-scoped
10. **`app/api/cron-results/*`** - Cron results now user-scoped
11. **`app/api/evening-checkin/*`** - Evening check-in now user-scoped
12. **`app/api/notifications/*`** - Notifications now fully user-scoped

## Environment Variables Required

```bash
# NextAuth.js Configuration
NEXTAUTH_SECRET=your_random_secret_key  # Generate with: openssl rand -base64 32
NEXTAUTH_URL=http://localhost:3000      # Your app URL

# Google OAuth Credentials
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
```

### Google OAuth Setup Instructions

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing
3. Enable the following APIs:
   - Gmail API
   - Google Calendar API
4. Go to **Credentials** → **Create Credentials** → **OAuth 2.0 Client ID**
5. Configure the consent screen (External for testing)
6. Set application type to **Web application**
7. Add authorized redirect URIs:
   - `http://localhost:3000/api/auth/callback/google` (local development)
   - `https://yourdomain.com/api/auth/callback/google` (production)
8. Copy the Client ID and Client Secret to your `.env.local` file

## Features Implemented

### 1. Protected Routes
All routes except `/login` and `/api/auth/*` require authentication. Unauthenticated users are automatically redirected to the login page with a callback URL to return them after signing in.

### 2. Login Page
- Dark theme matching dashboard design (#0d1117 background)
- Centered card with Juno logo
- Google sign-in button with proper branding
- Error handling for OAuth failures
- Consent text for Gmail/Calendar permissions

### 3. Session Management
- JWT-based sessions with 30-day expiration
- Access tokens and refresh tokens stored for Google API calls
- Session persists across page refreshes

### 4. User Menu
- Displays in top-right corner when authenticated
- Shows user avatar and name
- Dropdown with user email and sign-out option
- Closes when clicking outside

### 5. OAuth Scopes
The following Google scopes are requested:
- `openid` - OpenID Connect
- `email` - User email address
- `profile` - Basic profile info
- `gmail.readonly` - Read Gmail messages
- `gmail.modify` - Modify Gmail (mark as read, archive)
- `calendar.readonly` - Read Calendar events

## Multi-User Data Isolation

All data is now scoped to individual users using their email address as the user ID. This ensures complete data isolation between users.

### Redis Key Patterns

| Data Type | Old Key | New Key Pattern |
|-----------|---------|-----------------|
| Trades | `trades:v2:data` | `trades:v2:{userId}:data` |
| Habits | `habits_data:{date}` | `habits:{userId}:data:{date}` |
| Goals | `goals_data` | `goals:{userId}:data` |
| Journal | `daily-journal:{date}` | `journal:{userId}:entry:{date}` |
| Cron Results | `cron_results` | `cron_results:{userId}` |
| Activity Log | `activity_log` | `activity_log:{userId}` |
| Evening Check-in | `evening_checkins` | `evening_checkin:{userId}` |
| Notifications | `notification:{id}` | `notification:{userId}:{id}` |

### User ID Format
The user ID is derived from the user's email address (normalized to lowercase):
```typescript
userId = email.toLowerCase().trim()
```

This creates a stable, predictable ID that doesn't require database lookups.

## Data Migration

### Migration Endpoint

After deploying this update, run the one-time migration to move existing global data to user-scoped keys:

```bash
# Check migration status
GET /api/migrate

# Run migration (migrates all legacy data to authenticated user's scope)
POST /api/migrate

# Delete legacy data after confirming migration worked
DELETE /api/migrate
```

### Migration Process

1. **Check status first:** `GET /api/migrate` shows what legacy data exists and what user-scoped data exists
2. **Run migration:** `POST /api/migrate` moves all legacy data to `trades:v2:{your-email}:data`, etc.
3. **Verify:** Check that all your data is accessible
4. **Cleanup (optional):** `DELETE /api/migrate` removes all legacy global data

### Important Notes

- Only authenticated users can run the migration
- The first user to run the migration becomes the owner of all legacy data
- Migration is idempotent - running it multiple times won't duplicate data
- Legacy data is preserved until explicitly deleted via DELETE /api/migrate

## Testing Locally

1. Copy `.env.example` to `.env.local` and fill in your credentials
2. Run `npm install` to install dependencies
3. Run `npm run dev` to start the development server
4. Visit `http://localhost:3000`
5. You should be redirected to `/login`
6. Click "Sign in with Google" and authorize the app
7. You should be redirected back to the dashboard

## Testing Multi-User Isolation

1. Sign in with User A
2. Add some trades, habits, goals, or journal entries
3. Sign out
4. Sign in with User B (different Google account)
5. Verify that User A's data is not visible
6. Add data as User B
7. Sign back in as User A and verify User B's data is not visible

## Breaking Changes

### For API Consumers

- All API endpoints now require authentication (401 if not logged in)
- The `userId` query parameter is no longer needed (derived from session)
- Existing API calls from external services will need to include authentication

### For Data Access

- Direct Redis access must use new key patterns
- Legacy global keys are no longer used by the application
- Migration must be run to preserve existing data

## Security Considerations

1. **Data Isolation:** Each user can only access their own data
2. **Session Security:** JWT tokens are signed and expire after 30 days
3. **CSRF Protection:** NextAuth.js handles CSRF protection automatically
4. **Secure Headers:** Middleware ensures proper security headers

## Future Enhancements

- Admin dashboard to view all users (for system administrators)
- User switching capability for admins
- Data export per user
- Data deletion/GDPR compliance endpoint
