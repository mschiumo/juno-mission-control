/**
 * Gmail API Endpoint
 * 
 * GET: Fetch recent emails from Gmail
 * Uses OAuth credentials for authentication
 * 
 * Query params:
 * - maxResults: Number of emails to fetch (default: 10, max: 50)
 * - label: Label to filter by (default: INBOX)
 * - unreadOnly: Only fetch unread emails (default: false)
 */

import { NextResponse } from 'next/server';
import { google } from 'googleapis';
import { createClient } from 'redis';

// OAuth credentials
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const GOOGLE_REFRESH_TOKEN = process.env.GOOGLE_REFRESH_TOKEN;

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
 * Get Gmail client with OAuth2
 */
function getGmailClient() {
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REFRESH_TOKEN) {
    throw new Error('Missing Gmail OAuth credentials');
  }

  const auth = new google.auth.OAuth2(
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET
  );

  auth.setCredentials({
    refresh_token: GOOGLE_REFRESH_TOKEN,
  });

  return google.gmail({ version: 'v1', auth });
}

/**
 * Decode base64url encoded string
 */
function decodeBase64Url(data: string): string {
  const base64 = data.replace(/-/g, '+').replace(/_/g, '/');
  const buffer = Buffer.from(base64, 'base64');
  return buffer.toString('utf8');
}

/**
 * Extract header value from message
 */
function getHeader(headers: any[], name: string): string {
  const header = headers.find(h => h.name?.toLowerCase() === name.toLowerCase());
  return header?.value || '';
}

/**
 * Get email body from message parts
 */
function getEmailBody(payload: any): string {
  if (!payload) return '';

  // If it's a simple text/plain or text/html
  if (payload.body?.data) {
    return decodeBase64Url(payload.body.data);
  }

  // If it has parts, look for text/plain or text/html
  if (payload.parts) {
    // Prefer text/plain
    const textPart = payload.parts.find((part: any) => 
      part.mimeType === 'text/plain' && part.body?.data
    );
    if (textPart) {
      return decodeBase64Url(textPart.body.data);
    }

    // Fallback to text/html
    const htmlPart = payload.parts.find((part: any) => 
      part.mimeType === 'text/html' && part.body?.data
    );
    if (htmlPart) {
      // Strip HTML tags for plain text
      const html = decodeBase64Url(htmlPart.body.data);
      return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    }

    // Recursively check nested parts
    for (const part of payload.parts) {
      if (part.parts) {
        const nestedBody = getEmailBody(part);
        if (nestedBody) return nestedBody;
      }
    }
  }

  return '';
}

/**
 * Check if message has attachments
 */
function hasAttachments(payload: any): boolean {
  if (!payload) return false;
  
  if (payload.parts) {
    return payload.parts.some((part: any) => 
      part.mimeType?.startsWith('application/') ||
      part.mimeType?.startsWith('image/') ||
      part.mimeType?.startsWith('video/') ||
      part.filename
    );
  }
  
  return false;
}

/**
 * Fetch emails from Gmail API
 */
async function fetchEmails(
  maxResults: number = 10,
  label: string = 'INBOX',
  unreadOnly: boolean = false
): Promise<EmailMessage[]> {
  const gmail = getGmailClient();

  // Build query
  let query = '';
  if (unreadOnly) {
    query = 'is:unread';
  }

  // List messages
  const listResponse = await gmail.users.messages.list({
    userId: 'me',
    maxResults,
    labelIds: [label],
    q: query || undefined,
  });

  const messages = listResponse.data.messages || [];
  if (messages.length === 0) {
    return [];
  }

  // Fetch full details for each message
  const emails: EmailMessage[] = await Promise.all(
    messages.map(async (msg): Promise<EmailMessage> => {
      try {
        const detailResponse = await gmail.users.messages.get({
          userId: 'me',
          id: msg.id!,
          format: 'full',
        });

        const message = detailResponse.data;
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
        console.error(`Failed to fetch message ${msg.id}:`, error);
        return {
          id: msg.id || '',
          threadId: msg.threadId || '',
          subject: 'Error loading email',
          from: '',
          to: '',
          date: '',
          snippet: 'Failed to load email details',
          isUnread: false,
          labels: [],
          hasAttachments: false,
        };
      }
    })
  );

  return emails;
}

/**
 * Cache emails in Redis
 */
async function cacheEmails(userId: string, emails: EmailMessage[]): Promise<boolean> {
  try {
    const redis = await getRedisClient();
    if (!redis) return false;

    const cacheKey = `gmail:emails:${userId}`;
    const cacheData = {
      emails,
      timestamp: new Date().toISOString(),
      count: emails.length
    };

    // Cache for 5 minutes
    await redis.setEx(cacheKey, 300, JSON.stringify(cacheData));
    return true;
  } catch (error) {
    console.error('Failed to cache emails:', error);
    return false;
  }
}

/**
 * Get cached emails from Redis
 */
async function getCachedEmails(userId: string): Promise<{ emails: EmailMessage[]; timestamp: string } | null> {
  try {
    const redis = await getRedisClient();
    if (!redis) return null;

    const cacheKey = `gmail:emails:${userId}`;
    const cached = await redis.get(cacheKey);
    
    if (cached) {
      return JSON.parse(cached);
    }
    return null;
  } catch (error) {
    console.error('Failed to get cached emails:', error);
    return null;
  }
}

// Mock emails for fallback
const MOCK_EMAILS: EmailMessage[] = [
  {
    id: '1',
    threadId: 't1',
    subject: 'Your daily trading summary',
    from: 'Juno <juno@keepliving.com>',
    to: 'you@example.com',
    date: new Date().toISOString(),
    snippet: 'Here is your daily trading summary...',
    body: 'Here is your daily trading summary for today. You completed 3 trades with a win rate of 67%.',
    isUnread: true,
    labels: ['INBOX', 'UNREAD'],
    hasAttachments: false
  },
  {
    id: '2',
    threadId: 't2',
    subject: 'Market alert: SPY moving',
    from: 'Market Alerts <alerts@example.com>',
    to: 'you@example.com',
    date: new Date(Date.now() - 3600000).toISOString(),
    snippet: 'SPY has moved 2% in the last hour...',
    body: 'SPY has moved 2% in the last hour. Consider reviewing your positions.',
    isUnread: true,
    labels: ['INBOX', 'UNREAD'],
    hasAttachments: false
  },
  {
    id: '3',
    threadId: 't3',
    subject: 'Weekly goals reminder',
    from: 'Juno <juno@keepliving.com>',
    to: 'you@example.com',
    date: new Date(Date.now() - 86400000).toISOString(),
    snippet: 'Don\'t forget to review your weekly goals...',
    body: 'Don\'t forget to review your weekly goals and track your progress.',
    isUnread: false,
    labels: ['INBOX'],
    hasAttachments: false
  }
];

/**
 * GET handler - Fetch Gmail emails
 * 
 * Query params:
 * - userId: User identifier (default: 'default')
 * - maxResults: Number of emails to fetch (default: 10)
 * - label: Label to filter by (default: INBOX)
 * - unreadOnly: Only fetch unread (default: false)
 * - refresh: Force refresh from API (default: false)
 * - mock: Return mock data (default: false)
 */
export async function GET(request: Request) {
  const startTime = Date.now();
  
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId') || 'default';
    const maxResults = Math.min(parseInt(searchParams.get('maxResults') || '10', 10), 50);
    const label = searchParams.get('label') || 'INBOX';
    const unreadOnly = searchParams.get('unreadOnly') === 'true';
    const forceRefresh = searchParams.get('refresh') === 'true';
    const useMock = searchParams.get('mock') === 'true';

    // Return mock data if explicitly requested
    if (useMock) {
      return NextResponse.json({
        success: true,
        data: {
          emails: MOCK_EMAILS,
          unreadCount: MOCK_EMAILS.filter(e => e.isUnread).length,
          totalCount: MOCK_EMAILS.length
        },
        mock: true,
        timestamp: new Date().toISOString()
      });
    }

    // Check if OAuth credentials are configured
    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REFRESH_TOKEN) {
      console.warn('Missing Gmail OAuth credentials, returning mock data');
      return NextResponse.json({
        success: true,
        data: {
          emails: MOCK_EMAILS,
          unreadCount: MOCK_EMAILS.filter(e => e.isUnread).length,
          totalCount: MOCK_EMAILS.length
        },
        mock: true,
        message: 'Gmail OAuth not configured',
        timestamp: new Date().toISOString()
      });
    }

    // Try to get cached emails first (unless force refresh)
    if (!forceRefresh) {
      const cached = await getCachedEmails(userId);
      if (cached) {
        const emails = cached.emails;
        const unreadCount = emails.filter(e => e.isUnread).length;
        
        return NextResponse.json({
          success: true,
          data: {
            emails,
            unreadCount,
            totalCount: emails.length
          },
          cached: true,
          cachedAt: cached.timestamp,
          timestamp: new Date().toISOString()
        });
      }
    }

    // Fetch emails from Gmail API
    const emails = await fetchEmails(maxResults, label, unreadOnly);
    
    // Cache the emails
    await cacheEmails(userId, emails);

    const unreadCount = emails.filter(e => e.isUnread).length;
    const duration = Date.now() - startTime;

    return NextResponse.json({
      success: true,
      data: {
        emails,
        unreadCount,
        totalCount: emails.length
      },
      cached: false,
      durationMs: duration,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    console.error('Gmail API error:', error);
    
    // Return mock data on error
    return NextResponse.json({
      success: true,
      data: {
        emails: MOCK_EMAILS,
        unreadCount: MOCK_EMAILS.filter(e => e.isUnread).length,
        totalCount: MOCK_EMAILS.length
      },
      mock: true,
      error: errorMessage,
      durationMs: duration,
      timestamp: new Date().toISOString()
    });
  }
}
