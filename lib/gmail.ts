/**
 * Gmail API utilities
 * 
 * To use in production:
 * 1. Enable Gmail API in Google Cloud Console
 * 2. Use same OAuth credentials as Calendar
 * 3. Add Gmail scopes to your OAuth consent screen
 */

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const GOOGLE_REFRESH_TOKEN = process.env.GOOGLE_REFRESH_TOKEN;

export interface EmailMessage {
  id: string;
  threadId: string;
  labelIds: string[];
  snippet: string;
  payload: {
    headers: Array<{
      name: string;
      value: string;
    }>;
    parts?: Array<{
      mimeType: string;
      body: {
        data?: string;
      };
    }>;
  };
  internalDate: string;
}

/**
 * Get access token from refresh token
 */
export async function getGmailAccessToken(): Promise<string | null> {
  if (!GOOGLE_REFRESH_TOKEN || !GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    console.error('Missing Google credentials');
    return null;
  }

  try {
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        refresh_token: GOOGLE_REFRESH_TOKEN,
        grant_type: 'refresh_token'
      })
    });

    const data = await response.json();
    return data.access_token;
  } catch (error) {
    console.error('Failed to get access token:', error);
    return null;
  }
}

/**
 * Fetch recent emails from Gmail
 */
export async function fetchRecentEmails(maxResults: number = 10): Promise<EmailMessage[]> {
  const accessToken = await getGmailAccessToken();
  if (!accessToken) return [];

  try {
    // First, get message IDs
    const listResponse = await fetch(
      `https://www.googleapis.com/gmail/v1/users/me/messages?maxResults=${maxResults}&labelIds=INBOX`,
      {
        headers: { Authorization: `Bearer ${accessToken}` }
      }
    );

    const listData = await listResponse.json();
    const messages = listData.messages || [];

    // Fetch full message details
    const emailDetails = await Promise.all(
      messages.map(async (msg: { id: string }) => {
        const detailResponse = await fetch(
          `https://www.googleapis.com/gmail/v1/users/me/messages/${msg.id}`,
          {
            headers: { Authorization: `Bearer ${accessToken}` }
          }
        );
        return await detailResponse.json();
      })
    );

    return emailDetails;
  } catch (error) {
    console.error('Failed to fetch emails:', error);
    return [];
  }
}

/**
 * Send an email via Gmail API
 */
export async function sendEmail(
  to: string,
  subject: string,
  body: string
): Promise<boolean> {
  const accessToken = await getGmailAccessToken();
  if (!accessToken) return false;

  const email = [
    'Content-Type: text/plain; charset="UTF-8"\n',
    'MIME-Version: 1.0\n',
    'Content-Transfer-Encoding: 7bit\n',
    `To: ${to}\n`,
    `Subject: ${subject}\n\n`,
    body
  ].join('');

  const encodedEmail = Buffer.from(email).toString('base64').replace(/\+/g, '-').replace(/\//g, '_');

  try {
    const response = await fetch('https://www.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ raw: encodedEmail })
    });

    return response.ok;
  } catch (error) {
    console.error('Failed to send email:', error);
    return false;
  }
}
