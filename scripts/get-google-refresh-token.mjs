#!/usr/bin/env node
/**
 * One-time script to obtain a Google OAuth2 refresh token for Calendar access.
 *
 * Usage:
 *   GOOGLE_CLIENT_ID=xxx GOOGLE_CLIENT_SECRET=yyy node scripts/get-google-refresh-token.mjs
 *
 * It will print a URL — open it in your browser, authorize, paste the code back,
 * then copy the refresh_token into your .env.local file.
 *
 * Prerequisites:
 *   1. Create a project in Google Cloud Console: https://console.cloud.google.com/
 *   2. Enable the Google Calendar API.
 *   3. Create an OAuth 2.0 Client ID (type: Desktop app).
 *   4. Copy the Client ID and Client Secret here.
 */

import { createInterface } from 'readline';
import { google } from 'googleapis';

const clientId = process.env.GOOGLE_CLIENT_ID;
const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

if (!clientId || !clientSecret) {
  console.error('Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET before running this script.');
  process.exit(1);
}

const oauth2Client = new google.auth.OAuth2(
  clientId,
  clientSecret,
  'urn:ietf:wg:oauth:2.0:oob' // Desktop/out-of-band redirect
);

const authUrl = oauth2Client.generateAuthUrl({
  access_type: 'offline',
  prompt: 'consent', // Forces refresh_token to be returned every time
  scope: ['https://www.googleapis.com/auth/calendar.readonly'],
});

console.log('\nOpen this URL in your browser and authorize access:\n');
console.log(authUrl);
console.log('\nPaste the authorization code here:');

const rl = createInterface({ input: process.stdin, output: process.stdout });
rl.question('> ', async (code) => {
  rl.close();
  try {
    const { tokens } = await oauth2Client.getToken(code.trim());
    console.log('\nAdd these to your .env.local:\n');
    console.log(`GOOGLE_CLIENT_ID=${clientId}`);
    console.log(`GOOGLE_CLIENT_SECRET=${clientSecret}`);
    console.log(`GOOGLE_REFRESH_TOKEN=${tokens.refresh_token}`);
    console.log(`GOOGLE_CALENDAR_ID=mschiumo18@gmail.com`);
  } catch (err) {
    console.error('Failed to exchange code:', err.message);
    process.exit(1);
  }
});
