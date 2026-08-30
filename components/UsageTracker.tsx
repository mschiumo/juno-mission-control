'use client';

/**
 * Global usage tracker — records page visits and clicks for the owner's
 * analytics dashboard (Accounts tab). Mounted once in app/layout.tsx.
 *
 * "Pages" here are logical views: the app is a single-page dashboard whose
 * navigation lives in ?tab=/?subtab= (see app/page.tsx / TradingView.tsx),
 * so a visit is derived from pathname + search params, not route changes.
 *
 * Events are queued in memory and flushed batched — after a short debounce,
 * when the queue fills, and on tab-hide via sendBeacon so the last batch
 * survives closing the tab. Tracking is strictly fire-and-forget: failures
 * are swallowed and never surface to the user.
 */

import { useCallback, useEffect, useRef } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { isOwnerEmail } from '@/lib/owner';

type QueuedEvent = { type: 'pageview' | 'click'; page: string; label?: string };

const FLUSH_DEBOUNCE_MS = 4000;
const FLUSH_AT_QUEUE_SIZE = 20;
const ANON_ID_KEY = 'ct-anon-id';

function getAnonId(): string {
  try {
    const existing = localStorage.getItem(ANON_ID_KEY);
    if (existing) return existing;
    const id =
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    localStorage.setItem(ANON_ID_KEY, id);
    return id;
  } catch {
    return 'unknown';
  }
}

/** Best human-readable label for a clicked control, shortest signal first. */
function labelFor(el: HTMLElement): string | null {
  const explicit = el.getAttribute('data-track') || el.getAttribute('aria-label') || el.title;
  if (explicit) return explicit.trim().slice(0, 60);
  const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim();
  return text ? text.slice(0, 60) : null;
}

export default function UsageTracker() {
  const { data: session, status } = useSession();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const queueRef = useRef<QueuedEvent[]>([]);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pageRef = useRef<string>('');
  const lastPageviewRef = useRef<string>('');

  // Logical view path: "/landing" for guests, "/{tab}[/{subtab}]" once signed in.
  const isOwner = isOwnerEmail(session?.user?.email);
  let page = pathname;
  if (pathname === '/') {
    if (status === 'unauthenticated') {
      page = '/landing';
    } else {
      const tab = searchParams.get('tab') ?? (isOwner ? 'dashboard' : 'trading');
      const subtab = searchParams.get('subtab');
      page = subtab && tab === 'trading' ? `/${tab}/${subtab}` : `/${tab}`;
    }
  }
  pageRef.current = page;

  const flush = useCallback((useBeacon: boolean) => {
    const events = queueRef.current.splice(0, queueRef.current.length);
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (events.length === 0) return;
    const payload = JSON.stringify({ visitor: getAnonId(), events });
    try {
      if (useBeacon && navigator.sendBeacon) {
        navigator.sendBeacon(
          '/api/analytics/track',
          new Blob([payload], { type: 'application/json' }),
        );
      } else {
        fetch('/api/analytics/track', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: payload,
          keepalive: true,
        }).catch(() => {});
      }
    } catch {
      // Tracking must never break the app.
    }
  }, []);

  const enqueue = useCallback(
    (event: QueuedEvent) => {
      queueRef.current.push(event);
      if (queueRef.current.length >= FLUSH_AT_QUEUE_SIZE) {
        flush(false);
        return;
      }
      if (!timerRef.current) {
        timerRef.current = setTimeout(() => {
          timerRef.current = null;
          flush(false);
        }, FLUSH_DEBOUNCE_MS);
      }
    },
    [flush],
  );

  // Pageview on each logical-view change; dedupe against the last one so
  // re-renders and unrelated param changes (e.g. ?ticker=) don't double count.
  useEffect(() => {
    if (status === 'loading') return;
    if (lastPageviewRef.current === page) return;
    lastPageviewRef.current = page;
    enqueue({ type: 'pageview', page });
  }, [status, page, enqueue]);

  // Click delegation + unload flushing — mounted once.
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const target = e.target instanceof Element ? e.target : null;
      const el = target?.closest<HTMLElement>('button, a, [role="button"], [data-track]');
      if (!el) return;
      const label = labelFor(el);
      if (!label) return;
      enqueue({ type: 'click', page: pageRef.current, label });
    };

    const onHide = () => {
      if (document.visibilityState === 'hidden') flush(true);
    };

    document.addEventListener('click', onClick, { capture: true, passive: true });
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', onHide);
    return () => {
      document.removeEventListener('click', onClick, { capture: true });
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', onHide);
      flush(true);
    };
  }, [enqueue, flush]);

  return null;
}
