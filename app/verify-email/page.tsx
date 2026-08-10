'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Check, Loader2, X } from 'lucide-react';

function VerifyEmailInner() {
  const token = useSearchParams().get('token') ?? '';
  const [state, setState] = useState<'working' | 'done' | 'failed'>('working');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token) {
      setState('failed');
      setError('This link is missing its confirmation code. Open the link from your email directly.');
      return;
    }
    (async () => {
      try {
        const res = await fetch('/api/auth/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        });
        const json = await res.json();
        if (json.success) setState('done');
        else {
          setState('failed');
          setError(json.error || 'That link could not be confirmed.');
        }
      } catch {
        setState('failed');
        setError('Something went wrong confirming that link. Try again in a moment.');
      }
    })();
  }, [token]);

  return (
    <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-6 text-center">
      {state === 'working' && (
        <>
          <Loader2 className="w-6 h-6 text-[#8b949e] animate-spin mx-auto mb-3" />
          <p className="text-sm text-[#8b949e]">Confirming your email…</p>
        </>
      )}
      {state === 'done' && (
        <>
          <Check className="w-6 h-6 text-[#3fb950] mx-auto mb-3" />
          <p className="text-sm font-semibold text-[#e6edf3] mb-1">Email confirmed</p>
          <p className="text-xs text-[#8b949e] mb-4">
            Your account is fully set up. Everything is unlocked.
          </p>
          <Link
            href="/"
            className="inline-block px-5 py-2.5 rounded-lg bg-[#F97316] hover:bg-[#ea6c10] text-white text-sm font-semibold transition-colors"
          >
            Go to ConfluenceTrading
          </Link>
        </>
      )}
      {state === 'failed' && (
        <>
          <X className="w-6 h-6 text-[#f85149] mx-auto mb-3" />
          <p className="text-sm font-semibold text-[#e6edf3] mb-1">Couldn&apos;t confirm that link</p>
          <p className="text-xs text-[#8b949e] mb-4">{error}</p>
          <Link
            href="/"
            className="inline-block px-5 py-2.5 rounded-lg border border-[#30363d] text-[#c9d1d9] hover:border-[#F97316]/50 text-sm font-semibold transition-colors"
          >
            Sign in and resend
          </Link>
        </>
      )}
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <div className="min-h-screen bg-[#0d1117] flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <h1 className="text-xl font-bold text-[#e6edf3] text-center mb-6">Confirm your email</h1>
        <Suspense fallback={null}>
          <VerifyEmailInner />
        </Suspense>
      </div>
    </div>
  );
}
