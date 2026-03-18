/**
 * Gmail API Endpoint - Service Account
 * 
 * GET /api/gmail - Fetch recent emails from Gmail
 * Uses Google Service Account for server-to-server authentication
 * 
 * Query params:
 * - maxResults: Number of emails to fetch (default: 10, max: 50)
 * - label: Label to filter by (default: INBOX)
 * - unreadOnly: Only fetch unread emails (default: false)
 * - userEmail: Email to impersonate (default: from env)
 */

import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { createClient } from 'redis';

// Service Account configuration from env
const GOOGLE_SERVICE_ACCOUNT_JSON = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
const IMPERSONATE_USER = process.env.GOOGLE_IMPERSONATE_USER || 'michael@keepliving.com';

// Redis client for caching
let redisClient: ReturnType<typeof createClient> | null = null;

async function getRedisClient() {
  if (redisClient?.isReady) {
    return redisClient;
  }
  
  try {
    const client = createClient({
      url: process.env.UPSTASH_REDIS_URL || process.env.REDIS_URL || undefined,
    });
    
    client.on('error', (err) => {
      console.error('Redis Client Error:', err);
    });
    
    await client.connect();
    redisClient = client;
    return client;
  } catch (error) {
    console.error('Failed to connect to Redis:', error);
    return null;
  }
}

export interface EmailMessage {
  id: string;
  threadId: string;
  subject: string;
  from: string;
  to: string;
  date: string;
  snippet: string;
  body?: string;
  isUnread: boolean;
  labels: string[];
  hasAttachments: boolean;
}

/**
 * Get Gmail client with Service Account
 */
function getGmailClient(userEmail: string = IMPERSONATE_USER) {
  if (!GOOGLE_SERVICE_ACCOUNT_JSON) {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON not set. Add service account credentials to environment variables.');
  }

  let credentials;
  try {
    credentials = JSON.parse(GOOGLE_SERVICE_ACCOUNT_JSON);
  } catch (error) {
    throw new Error('Invalid GOOGLE_SERVICE_ACCOUNT_JSON format');
  }

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/gmail.readonly'],
    clientOptions: {
      subject: userEmail,
    },
  });

  return google.gmail({ version: 'v1', auth });
}

function decodeBase64Url(data: string): string {
  const base64 = data.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(base64, 'base64').toString('utf8');
}

function getHeader(headers: any[], name: string): string {
  const header = headers.find(h => h.name?.toLowerCase() === name.toLowerCase());
  return header?.value || '';
}

function getEmailBody(payload: any): string {
  if (!payload) return '';
  if (payload.body?.data) return decodeBase64Url(payload.body.data);
  
  if (payload.parts) {
    const textPart = payload.parts.find((p: any) => p.mimeType === 'text/plain' && p.body?.data);
    if (textPart) return decodeBase64Url(textPart.body.data);
    
    const htmlPart = payload.parts.find((p: any) => p.mimeType === 'text/html' && p.body?.data);
    if (htmlPart) {
      const html = decodeBase64Url(htmlPart.body.data);
      return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    }
    
    for (const part of payload.parts) {
      if (part.parts) {
        const nested = getEmailBody(part);
        if (nested) return nested;
      }
    }
  }
  return '';
}

function hasAttachments(payload: any): boolean {
  if (!payload?.parts) return false;
  return payload.parts.some((p: any) => 
    p.mimeType?.startsWith('application/') ||
    p.mimeType?.startsWith('image/') ||
    p.filename
  );
}

async function fetchEmails(maxResults = 10, label = 'INBOX', unreadOnly = false, userEmail = IMPERSONATE_USER): Promise<EmailMessage[]> {
  const gmail = getGmailClient(userEmail);
  
  const listResponse = await gmail.users.messages.list({
    userId: 'me',
    maxResults,
    labelIds: [label],
    q: unreadOnly ? 'is:unread' : undefined,
  });

  const messages = listResponse.data.messages || [];
  if (messages.length === 0) return [];

  const emails = await Promise.all(
    messages.map(async (msg): Promise<EmailMessage> => {
      try {
        const detail = await gmail.users.messages.get({ userId: 'me', id: msg.id!, format: 'full' });
        const message = detail.data;
        const payload = message.payload;
        const headers = payload?.headers || [];

        return {
          id: message.id || '',
          threadId: message.threadId || '',
          subject: getHeader(headers, 'Subject'),
          from: getHeader(headers, 'From'),
          to: getHeader(headers, 'To'),
          date: getHeader(headers, 'Date'),
          snippet: message.snippet || '',
          body: getEmailBody(payload),
          isUnread: message.labelIds?.includes('UNREAD') || false,
          labels: message.labelIds || [],
          hasAttachments: hasAttachments(payload),
        };
      } catch (error) {
        return { id: msg.id || '', threadId: msg.threadId || '', subject: 'Error', from: '', to: '', date: '', snippet: '', isUnread: false, labels: [], hasAttachments: false };
      }
    })
  );

  return emails;
}

const MOCK_EMAILS: EmailMessage[] = [
  { id: '1', threadId: 't1', subject: 'Your daily trading summary', from: 'Juno <juno@keepliving.com>', to: 'you@example.com', date: new Date().toISOString(), snippet: 'Daily summary...', body: 'You completed 3 trades with 67% win rate.', isUnread: true, labels: ['INBOX', 'UNREAD'], hasAttachments: false },
  { id: '2', threadId: 't2', subject: 'Market alert: SPY moving', from: 'Alerts <alerts@example.com>', to: 'you@example.com', date: new Date(Date.now() - 3600000).toISOString(), snippet: 'SPY up 2%...', body: 'SPY has moved 2%.', isUnread: true, labels: ['INBOX', 'UNREAD'], hasAttachments: false },
];

export async function GET(request: Request) {
  const startTime = Date.now();
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get('userId') || 'default';
  const maxResults = Math.min(parseInt(searchParams.get('maxResults') || '10', 10), 50);
  const label = searchParams.get('label') || 'INBOX';
  const unreadOnly = searchParams.get('unreadOnly') === 'true';
  const useMock = searchParams.get('mock') === 'true' || !GOOGLE_SERVICE_ACCOUNT_JSON;

  if (useMock) {
    return NextResponse.json({
      success: true,
      data: { emails: MOCK_EMAILS, unreadCount: MOCK_EMAILS.filter(e => e.isUnread).length, totalCount: MOCK_EMAILS.length },
      mock: true,
      timestamp: new Date().toISOString()
    });
  }

  try {
    const emails = await fetchEmails(maxResults, label, unreadOnly);
    return NextResponse.json({
      success: true,
      data: { emails, unreadCount: emails.filter(e => e.isUnread).length, totalCount: emails.length },
      durationMs: Date.now() - startTime,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    return NextResponse.json({
      success: true,
      data: { emails: MOCK_EMAILS, unreadCount: MOCK_EMAILS.filter(e => e.isUnread).length, totalCount: MOCK_EMAILS.length },
      mock: true,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    });
  }
}
