'use client';

/**
 * /portfolio/connected — SnapTrade Connection Portal return page for the
 * long-term Portfolio tab. Mirrors /brokerage/connected: SnapTrade sends the
 * user here after they finish (or abandon) the brokerage login, and linking an
 * account does not pull any data on its own, so this page runs the first sync
 * via /api/portfolio/connect/complete and then hands off to the Portfolio tab
 * with a result banner.
 */

import { Suspense, useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Link2, AlertTriangle } from 'lucide-react';

const PORTFOLIO_PATH = '/?tab=portfolio';

function PortfolioReturn() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const portalError = searchParams.get('error') || searchParams.get('errorCode');
  const failed = Boolean(portalError);
  const message = failed
    ? 'That brokerage link didn’t complete.'
    : 'Pulling your portfolio from the brokerage…';

  // React strict mode double-invokes effects; the sync POST must not run twice.
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    const go = (params: Record<string, string>) => {
      const qs = new URLSearchParams(params).toString();
      router.replace(`${PORTFOLIO_PATH}&${qs}`);
    };

    if (portalError) {
      setTimeout(() => go({ portfolio: 'error', reason: portalError.slice(0, 120) }), 1400);
      return;
    }

    (async () => {
      try {
        const res = await fetch('/api/portfolio/connect/complete', { method: 'POST' });
        const json = await res.json();
        if (json.success && json.data?.connected) {
          go({
            portfolio: 'connected',
            positions: String(json.data?.positions ?? 0),
            ...(json.data?.brokerage ? { name: json.data.brokerage } : {}),
          });
        } else if (json.success) {
          go({ portfolio: 'error', reason: 'No brokerage account was linked.' });
        } else {
          go({ portfolio: 'error', reason: (json.error || 'Sync failed').slice(0, 120) });
        }
      } catch {
        // The link itself succeeded — only the first pull failed; "Sync now"
        // (and the 6-hourly cron) can retry it.
        go({ portfolio: 'partial' });
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
          Taking you to your Portfolio…
        </p>
      </div>
    </div>
  );
}

export default function PortfolioConnectedPage() {
  return (
    <Suspense fallback={null}>
      <PortfolioReturn />
    </Suspense>
  );
}
