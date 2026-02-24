# Gmail OAuth Authentication + Multi-User Support + Email/Password Auth

This feature adds NextAuth.js with Google OAuth and email/password authentication to the Juno Mission Control dashboard, requiring users to authenticate before accessing any dashboard content. All data is user-scoped, ensuring complete data isolation between users.

## Changes Summary

### New Files Created

1. **`lib/auth-config.ts`** - NextAuth.js configuration with Google and Credentials providers
2. **`app/api/auth/[...nextauth]/route.ts`** - API route handlers for authentication
3. **`app/api/auth/signup/route.ts`** - Email/password registration endpoint
4. **`app/login/page.tsx`** - Login page with email/password and Google sign-in
5. **`app/signup/page.tsx`** - Signup page for creating email/password accounts
6. **`middleware.ts`** - Route protection middleware
7. **`components/AuthProvider.tsx`** - Session provider wrapper
8. **`components/UserMenu.tsx`** - User dropdown menu with sign-out
9. **`types/next-auth.d.ts`** - TypeScript type declarations for NextAuth
10. **`types/user.ts`** - User type definitions and helper functions
11. **`lib/db/user-data.ts`** - User-scoped data access helpers with Redis key patterns
12. **`app/api/migrate/route.ts`** - One-time data migration endpoint

### Modified Files

1. **`package.json`** - Added `next-auth@5.0.0-beta.30` and `bcrypt`
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

# Google OAuth Credentials (Optional - for Google sign-in)
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
All routes except `/login`, `/signup`, and `/api/auth/*` require authentication. Unauthenticated users are automatically redirected to the login page with a callback URL to return them after signing in.

### 2. Login Page (`/login`)
- Dark theme matching dashboard design (#0d1117 background)
- Email and password input fields
- Show/hide password toggle
- "Sign In" button for credentials login
- "Sign in with Google" button
- "Create account" link for new users
- Success message after registration redirect
- Error handling for invalid credentials

### 3. Signup Page (`/signup`)
- Full name input (optional)
- Email address input (required)
- Password input with minimum 8 character validation
- Confirm password input with matching validation
- Show/hide password toggles
- "Create Account" button with loading state
- Success screen with auto-redirect to login
- Link to login page for existing users

### 4. Session Management
- JWT-based sessions with 30-day expiration
- Access tokens and refresh tokens stored for Google API calls
- Session persists across page refreshes
- User ID available in session for data isolation

### 5. User Menu
- Displays in top-right corner when authenticated
- Shows user avatar and name
- Dropdown with user email and sign-out option
- Closes when clicking outside

### 6. OAuth Scopes (Google Only)
The following Google scopes are requested when using Google sign-in:
- `openid` - OpenID Connect
- `email` - User email address
- `profile` - Basic profile info
- `gmail.readonly` - Read Gmail messages
- `gmail.modify` - Modify Gmail (mark as read, archive)
- `calendar.readonly` - Read Calendar events

## Authentication Methods

### Email/Password (Credentials Provider)
- Users can register with email and password
- Passwords hashed with bcrypt (12 salt rounds)
- User data stored in Redis
- Works without Google OAuth configuration

### Google OAuth
- One-click sign-in with Google account
- Automatic profile creation
- Access to Gmail and Calendar APIs
- Requires Google OAuth credentials

## User Storage in Redis

### User by Email (Lookup Key)
```
Key: users:by-email:{email}
Value: {
  userId: string,
  email: string,
  hashedPassword: string (credentials only),
  name: string | null,
  createdAt: string,
  provider: 'credentials' | 'google'
}
```

### User by ID
```
Key: users:{userId}
Value: {
  userId: string,
  email: string,
  name: string | null,
  createdAt: string,
  provider: 'credentials' | 'google'
}
```

## Multi-User Data Isolation

All data is scoped to individual users using their email address as the user ID. This ensures complete data isolation between users.

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
The user ID is derived from the user's email address (normalized to lowercase) for OAuth users, or a generated UUID for credentials users:
```typescript
// OAuth: userId = email.toLowerCase().trim()
// Credentials: userId = crypto.randomUUID()
```

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

1. **Check status first:** `GET /api/migrate` to see what legacy data exists
2. **Run migration:** `POST /api/migrate` moves all legacy data to your user's scope
3. **Verify:** Check that all your data is accessible
4. **Cleanup** (optional): `DELETE /api/migrate` to remove legacy data

### Important Notes

- Only authenticated users can run the migration
- The first user to run the migration becomes the owner of all legacy data
- Migration is idempotent - running it multiple times won't duplicate data
- Legacy data is preserved until explicitly deleted via DELETE /api/migrate

## API Endpoints

### Authentication
- `GET/POST /api/auth/[...nextauth]` - NextAuth.js handlers
- `POST /api/auth/signup` - Email/password registration

### Migration
- `GET /api/migrate` - Check migration status
- `POST /api/migrate` - Run data migration
- `DELETE /api/migrate` - Delete legacy data

## Testing Locally

1. Copy `.env.example` to `.env.local` and fill in your credentials
2. Run `npm install` to install dependencies
3. Run `npm run dev` to start the development server
4. Visit `http://localhost:3000`
5. You should be redirected to `/login`

### Testing Email/Password Auth:
1. Click "Create account" on the login page
2. Fill in email, password, and confirm password
3. Submit the form
4. You should be redirected to login with a success message
5. Sign in with your credentials

### Testing Google OAuth:
1. Click "Sign in with Google" on the login page
2. Authorize the app with your Google account
3. You should be redirected to the dashboard

### Testing Multi-User Isolation:
1. Sign in with User A (email/password or Google)
2. Add some trades, habits, goals, or journal entries
3. Sign out
4. Sign in with User B (different account)
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
2. **Password Security:** Passwords hashed with bcrypt (12 rounds)
3. **Session Security:** JWT tokens are signed and expire after 30 days
4. **CSRF Protection:** NextAuth.js handles CSRF protection automatically
5. **Secure Headers:** Middleware ensures proper security headers

## Troubleshooting

### "Invalid email or password" Error
- Verify the email address is correct
- Check that the password is correct (case-sensitive)
- If you signed up with Google, use "Sign in with Google" instead

### "An account with this email already exists" Error
- The email is already registered (either via credentials or Google OAuth)
- Try signing in instead of signing up
- If you forgot your password, contact support (password reset not yet implemented)

### Google OAuth Not Working
- Verify `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are set correctly
- Ensure redirect URIs are configured in Google Cloud Console
- Check that Gmail and Calendar APIs are enabled

## Future Enhancements

- Password reset functionality
- Admin dashboard to view all users
- User switching capability for admins
- Data export per user
- Data deletion/GDPR compliance endpoint
- Email verification for new accounts
