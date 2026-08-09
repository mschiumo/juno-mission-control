'use client';

/**
 * Persistent nudge for accounts that haven't confirmed their email. Shown in
 * the app shell above the content — never blocking, because the free tier
 * stays usable; it only explains why the trial and checkout are unavailable.
 */

import { useState } from 'react';
import { Mail, Check, Loader2 } from 'lucide-react';
import { usePlanStatus } from '@/lib/use-entitlements';

export default function VerifyEmailBanner() {
  const { status, loading } = usePlanStatus();
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (loading || status.emailVerified) return null;

  const resend = async () => {
    setSending(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/verify', { method: 'POST' });
      const json = await res.json();
      if (json.success) setSent(true);
      else setError(json.error || 'Could not send the email.');
    } catch {
      setError('Could not send the email.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div
      className="mb-4 rounded-xl px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3"
      style={{ background: 'var(--surface-1)', border: '1px solid var(--warning, #d29922)' }}
    >
      <Mail className="w-4 h-4 shrink-0" style={{ color: 'var(--warning, #d29922)' }} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
          Confirm your email address
        </p>
        <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
          {sent
            ? 'Sent — check your inbox (and spam). The link works once and lasts 24 hours.'
            : 'Your journal works as normal. Confirming unlocks the free trial and paid plans, and lets us reach you for password resets.'}
        </p>
        {error && <p className="text-xs mt-1" style={{ color: 'var(--negative, #f85149)' }}>{error}</p>}
      </div>
      <button
        onClick={resend}
        disabled={sending || sent}
        className="shrink-0 inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors disabled:opacity-60"
        style={{ background: 'var(--accent-dim)', color: 'var(--accent)' }}
      >
        {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : sent ? <Check className="w-3.5 h-3.5" /> : null}
        {sent ? 'Sent' : 'Resend link'}
      </button>
    </div>
  );
}
