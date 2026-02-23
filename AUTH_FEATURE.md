# Gmail OAuth Authentication Feature

This feature adds NextAuth.js with Google OAuth to the Juno Mission Control dashboard, requiring users to authenticate before accessing any dashboard content.

## Changes Summary

### New Files Created

1. **`lib/auth-config.ts`** - NextAuth.js configuration with Google provider
2. **`app/api/auth/[...nextauth]/route.ts`** - API route handlers for authentication
3. **`app/login/page.tsx`** - Login page with Google sign-in button
4. **`middleware.ts`** - Route protection middleware
5. **`components/AuthProvider.tsx`** - Session provider wrapper
6. **`components/UserMenu.tsx`** - User dropdown menu with sign-out
7. **`types/next-auth.d.ts`** - TypeScript type declarations

### Modified Files

1. **`package.json`** - Added `next-auth@5.0.0-beta.30`
2. **`app/layout.tsx`** - Wrapped with AuthProvider
3. **`app/page.tsx`** - Added UserMenu to header
4. **`.env.example`** - Documented required environment variables

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

## Testing Locally

1. Copy `.env.example` to `.env.local` and fill in your credentials
2. Run `npm install` to install dependencies
3. Run `npm run dev` to start the development server
4. Visit `http://localhost:3000`
5. You should be redirected to `/login`
6. Click "Sign in with Google" and authorize the app
7. You should be redirected back to the dashboard

## Notes

- The middleware uses the latest Next.js 16 App Router patterns
- NextAuth.js v5 beta is used for compatibility with Next.js 16
- TypeScript types are extended for custom session properties
- The UserMenu component is responsive and works on mobile
