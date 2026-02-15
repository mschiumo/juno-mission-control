/**
 * Google Calendar API utilities - Service Account
 * 
 * Uses Google Service Account for server-to-server authentication
 * No user interaction required
 */

// Service Account credentials from JSON key
const GOOGLE_SERVICE_ACCOUNT_EMAIL = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
const GOOGLE_SERVICE_ACCOUNT_KEY = process.env.GOOGLE_SERVICE_ACCOUNT_KEY?.replace(/\\n/g, '\n');
const GOOGLE_CALENDAR_ID = process.env.GOOGLE_CALENDAR_ID || 'primary';

export interface CalendarEvent {
  id: string;
  summary: string;
  description?: string;
  start: {
    dateTime?: string;
    date?: string;
  };
  end: {
    dateTime?: string;
    date?: string;
  };
}

/**
 * Get access token using service account
 */
async function getServiceAccountToken(): Promise<string | null> {
  if (!GOOGLE_SERVICE_ACCOUNT_EMAIL || !GOOGLE_SERVICE_ACCOUNT_KEY) {
    console.error('Missing service account credentials');
    return null;
  }

  try {
    // Create JWT claim
    const now = Math.floor(Date.now() / 1000);
    const claim = {
      iss: GOOGLE_SERVICE_ACCOUNT_EMAIL,
      scope: 'https://www.googleapis.com/auth/calendar',
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
    };

    // Base64 encode
    const encodeBase64 = (str: string) => Buffer.from(str).toString('base64url');
    
    const header = encodeBase64(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const payload = encodeBase64(JSON.stringify(claim));
    const signingInput = `${header}.${payload}`;

    // Sign with private key (simplified - in production use proper JWT library)
    // For now, we'll use a fetch to the token endpoint with grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: signingInput, // This needs proper signing
      }),
    });

    // For service accounts, we need the proper JWT signing
    // Let me implement this correctly:
    const crypto = await import('crypto');
    const sign = crypto.createSign('RSA-SHA256');
    sign.update(signingInput);
    const signature = sign.sign(GOOGLE_SERVICE_ACCOUNT_KEY, 'base64url');
    
    const jwt = `${signingInput}.${signature}`;

    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: jwt,
      }),
    });

    const data = await tokenResponse.json();
    return data.access_token;
  } catch (error) {
    console.error('Failed to get service account token:', error);
    return null;
  }
}

/**
 * Fetch events from Google Calendar
 */
export async function fetchCalendarEvents(
  calendarId: string = GOOGLE_CALENDAR_ID,
  maxResults: number = 10
): Promise<CalendarEvent[]> {
  const accessToken = await getServiceAccountToken();
  if (!accessToken) return [];

  const timeMin = new Date().toISOString();
  const timeMax = new Date();
  timeMax.setDate(timeMax.getDate() + 7);

  try {
    const response = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events?` +
      `maxResults=${maxResults}&` +
      `timeMin=${encodeURIComponent(timeMin)}&` +
      `timeMax=${encodeURIComponent(timeMax.toISOString())}&` +
      `singleEvents=true&` +
      `orderBy=startTime`,
      {
        headers: { Authorization: `Bearer ${accessToken}` }
      }
    );

    const data = await response.json();
    return data.items || [];
  } catch (error) {
    console.error('Failed to fetch calendar events:', error);
    return [];
  }
}

/**
 * Create a new calendar event
 */
export async function createCalendarEvent(event: Partial<CalendarEvent>): Promise<CalendarEvent | null> {
  const accessToken = await getServiceAccountToken();
  if (!accessToken) return null;

  try {
    const response = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${GOOGLE_CALENDAR_ID}/events`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          summary: event.summary,
          description: event.description,
          start: event.start,
          end: event.end
        })
      }
    );

    return await response.json();
  } catch (error) {
    console.error('Failed to create calendar event:', error);
    return null;
  }
}