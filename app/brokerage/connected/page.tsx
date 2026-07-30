'use client';

/**
 * /brokerage/connected — SnapTrade Connection Portal return page.
 *
 * SnapTrade sends the user here after they finish (or abandon) the brokerage
 * login. Connecting an account does NOT pull any trades on its own, so this
 * page runs the first sync immediately rather than leaving the user to
 * discover the Refresh button or wait for the nightly cron. Once the pull
 * finishes it hands off to the Journal with a result banner.
 *
 * SnapTrade appends its own query params on return (an `error`/`errorCode`
 * pair when the link failed or was abandoned); those are read here so a failed
 * link reports the reason instead of silently syncing nothing.
 */

import { Suspense, useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Link2, AlertTriangle } from 'lucide-react';

const JOURNAL_PATH = '/?tab=trading&subtab=overview';

function BrokerageReturn() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Whether the portal itself reported a failure is known at first render, so
  // it's derived here rather than latched through state in an effect.
  const portalError = searchParams.get('error') || searchParams.get('errorCode');
  const failed = Boolean(portalError);
  const message = failed
    ? 'That brokerage link didn’t complete.'
    : 'Pulling your trades from the brokerage…';

  // React strict mode double-invokes effects; the sync POST must not run twice.
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    const go = (params: Record<string, string>) => {
      const qs = new URLSearchParams(params).toString();
      router.replace(`${JOURNAL_PATH}&${qs}`);
    };

    // The portal itself failed or was abandoned — don't bother syncing.
    if (portalError) {
      setTimeout(() => go({ brokerage: 'error', reason: portalError.slice(0, 120) }), 1400);
      return;
    }

    (async () => {
      try {
        const res = await fetch('/api/snaptrade/sync', { method: 'POST' });
        const json = await res.json();
        if (json.success) {
          const n = json.data?.tradesWritten ?? 0;
          const brokerage = json.data?.perAccount?.[0]?.brokerage ?? '';
          go({ brokerage: 'connected', synced: String(n), ...(brokerage ? { name: brokerage } : {}) });
        } else {
          go({ brokerage: 'error', reason: (json.error || 'Sync failed').slice(0, 120) });
        }
      } catch {
        // The link itself succeeded — only the first pull failed, and the
        // Refresh button (and nightly cron) can retry it.
        go({ brokerage: 'partial' });
      }
    })();
  }, [router, portalError]);

  return (
    <div className="min-h-screen flex items-center justify-center p-6" style={{ background: 'var(--surface-0, #0d1117)' }}>
      <div
        className="flex flex-col items-center gap-4 text-center max-w-sm"
        role="status"
        aria-live="polite"
      >
        {failed ? (
          <AlertTriangle className="w-8 h-8 text-[#d29922]" />
        ) : (
          <div className="relative">
            <Link2 className="w-8 h-8 text-[#F97316]" />
            <span className="absolute -inset-3 rounded-full border-2 border-[#F97316]/30 border-t-[#F97316] animate-spin" />
          </div>
        )}
        <p className="text-sm" style={{ color: 'var(--text-secondary, #8b949e)' }}>
          {message}
        </p>
        <p className="text-xs" style={{ color: 'var(--text-tertiary, #6e7681)' }}>
          Taking you back to your Journal…
        </p>
      </div>
    </div>
  );
}

export default function BrokerageConnectedPage() {
  return (
    <Suspense fallback={null}>
      <BrokerageReturn />
    </Suspense>
  );
}
