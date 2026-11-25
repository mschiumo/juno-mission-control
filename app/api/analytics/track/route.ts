import { timingSafeEqual } from 'crypto';
import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { isOwnerEmail } from '@/lib/owner';
import {
  recordUsageEvents,
  sanitizeField,
  sanitizeReferrer,
  sanitizeCountry,
  parseAnalyticsSite,
  MAX_EVENTS_PER_BATCH,
  type AnalyticsSite,
  type UsageEventInput,
} from '@/lib/db/usage-analytics';

/**
 * Usage-event ingest for both tracked properties. Deliberately
 * session-optional (middleware bypasses it): logged-out landing-page visits
 * must count too, and the blog has no sessions at all.
 *
 * Sites:
 *   'app'        Same-origin batches from components/UsageTracker.tsx.
 *                Anonymous visitors send a self-generated id; authenticated
 *                visitors are keyed by their user id, which is taken from the
 *                session — never from the payload — so a visitor can't
 *                impersonate another user's activity. The owner's own traffic
 *                is flagged from the session email.
 *   'mjswrites'  Cross-origin batches from the inline tracker in mjswrites.com's
 *                Base.astro. Always anonymous (no credentials are sent). There
 *                is no login to recognise the owner by, so the browser presents
 *                ANALYTICS_OWNER_KEY — stored once via ?me=<key> — and a match
 *                flags the batch as the owner's. Without the env var nothing is
 *                flagged and every blog visit counts as a real visitor.
 *
 * Cross-origin: the blog posts as a CORS "simple request" (text/plain body,
 * no credentials), so no preflight is needed in practice, but OPTIONS is
 * answered anyway for robustness. Only the blog's origins are allowed.
 */

const ALLOWED_ORIGINS = new Set<string>([
  'https://mjswrites.com',
  'https://www.mjswrites.com',
  // Astro's dev server, so the blog tracker can be exercised locally.
  ...(process.env.NODE_ENV !== 'production' ? ['http://localhost:4321'] : []),
]);

function corsHeaders(origin: string | null): Record<string, string> {
  if (!origin || !ALLOWED_ORIGINS.has(origin)) return {};
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

export async function OPTIONS(request: Request): Promise<NextResponse> {
  return new NextResponse(null, { status: 204, headers: corsHeaders(request.headers.get('origin')) });
}

/** Constant-time compare against ANALYTICS_OWNER_KEY; false when unset. */
function matchesOwnerKey(candidate: unknown): boolean {
  const expected = process.env.ANALYTICS_OWNER_KEY;
  if (!expected || typeof candidate !== 'string') return false;
  const a = Buffer.from(candidate);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: Request): Promise<NextResponse> {
  const headers = corsHeaders(request.headers.get('origin'));
  const fail = (error: string) => NextResponse.json({ success: false, error }, { status: 400, headers });

  let body: { visitor?: unknown; events?: unknown; site?: unknown; ownerKey?: unknown };
  try {
    body = await request.json();
  } catch {
    return fail('Invalid JSON');
  }

  if (!Array.isArray(body.events) || body.events.length === 0) return fail('No events');
  if (body.events.length > MAX_EVENTS_PER_BATCH) return fail('Too many events');

  const site: AnalyticsSite = parseAnalyticsSite(body.site);

  const events: UsageEventInput[] = [];
  for (const raw of body.events) {
    if (!raw || typeof raw !== 'object') continue;
    const { type, page, label, referrer } = raw as Record<string, unknown>;
    const cleanPage = sanitizeField(page);
    if (!cleanPage) continue;
    if (type === 'pageview') {
      const event: UsageEventInput = { type, page: cleanPage };
      // Referrers are only meaningful for the public blog; the app tracker
      // never sends one and we don't want to start storing them by accident.
      if (site === 'mjswrites') event.referrer = sanitizeReferrer(referrer);
      events.push(event);
    } else if (type === 'click') {
      const cleanLabel = sanitizeField(label);
      if (cleanLabel) events.push({ type, page: cleanPage, label: cleanLabel });
    }
  }
  if (events.length === 0) return fail('No valid events');

  const anonId =
    typeof body.visitor === 'string' && /^[A-Za-z0-9-]{8,64}$/.test(body.visitor)
      ? body.visitor
      : 'unknown';

  let visitor: string;
  let isOwner: boolean;
  if (site === 'app') {
    const session = await auth();
    visitor = session?.user?.id ? `u:${session.user.id}` : `a:${anonId}`;
    // Owner traffic is still recorded, just in its own key space, so the
    // dashboard can show visitor numbers that aren't inflated by the owner's
    // own testing. Decided from the session, never from the payload.
    isOwner = isOwnerEmail(session?.user?.email);
  } else {
    // The blog never sends credentials, and even if a session cookie did
    // arrive it must not tie a blog visit to an app account.
    visitor = `a:${anonId}`;
    isOwner = matchesOwnerKey(body.ownerKey);
  }

  const country = sanitizeCountry(request.headers.get('x-vercel-ip-country'));

  await recordUsageEvents(visitor, events, { site, isOwner, country });
  return NextResponse.json({ success: true }, { headers });
}
