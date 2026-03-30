'use client';

import { useState, useEffect } from 'react';
import { Mail, Check, Loader2 } from 'lucide-react';
import Link from 'next/link';

interface EmailCTAProps {
  type: 'marketBriefing' | 'gapScanner';
  variant?: 'banner' | 'inline';
}

const LABELS = {
  marketBriefing: 'Get this briefing in your inbox every weekday morning',
  gapScanner: 'Get gap scan results emailed before market open',
};

export default function EmailCTA({ type, variant = 'banner' }: EmailCTAProps) {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch('/api/user/prefs')
      .then((r) => r.json())
      .then((data) => {
        if (data.success && data.prefs) {
          setEnabled(data.prefs.emailAlerts?.[type] ?? false);
        }
      })
      .catch(() => {});
  }, [type]);

  const toggle = async () => {
    setSaving(true);
    const newValue = !enabled;
    try {
      const current = enabled;
      // We need to preserve the other alert setting
      const prefsRes = await fetch('/api/user/prefs');
      const prefsData = await prefsRes.json();
      const currentAlerts = prefsData.prefs?.emailAlerts || { marketBriefing: false, gapScanner: false };

      const res = await fetch('/api/user/prefs', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          emailAlerts: { ...currentAlerts, [type]: newValue },
        }),
      });
      if (res.ok) {
        setEnabled(newValue);
      } else {
        setEnabled(current);
      }
    } catch {
      // revert on error
    } finally {
      setTimeout(() => setSaving(false), 400);
    }
  };

  // Don't render until we know the state
  if (enabled === null) return null;

  if (variant === 'inline') {
    // Compact icon button for card headers
    return (
      <button
        onClick={toggle}
        disabled={saving}
        title={enabled ? 'Email alerts enabled — click to disable' : 'Enable email alerts'}
        className={`p-1.5 rounded transition-colors ${
          enabled
            ? 'bg-[#F97316]/10 text-[#F97316]'
            : 'hover:bg-[#30363d] text-[#8b949e]'
        }`}
      >
        {saving ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : enabled ? (
          <Check className="w-3.5 h-3.5" />
        ) : (
          <Mail className="w-3.5 h-3.5" />
        )}
      </button>
    );
  }

  // Banner variant for modals
  if (enabled) {
    return (
      <div className="flex items-center gap-3 p-3 rounded-xl bg-[#F97316]/5 border border-[#F97316]/20">
        <Check className="w-4 h-4 text-[#F97316] shrink-0" />
        <p className="text-xs text-[#c9d1d9] flex-1">
          You&apos;re receiving this via email.{' '}
          <Link href="/profile" className="text-[#F97316] hover:underline">
            Manage in Settings
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 p-3 rounded-xl bg-[#161b22] border border-[#30363d]">
      <Mail className="w-4 h-4 text-[#8b949e] shrink-0" />
      <p className="text-xs text-[#8b949e] flex-1">{LABELS[type]}</p>
      <button
        onClick={toggle}
        disabled={saving}
        className="shrink-0 px-3 py-1.5 text-xs font-medium rounded-lg bg-[#F97316] text-white hover:bg-[#ea6c10] transition-colors disabled:opacity-50"
      >
        {saving ? 'Saving...' : 'Enable'}
      </button>
    </div>
  );
}
