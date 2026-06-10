'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Bell } from 'lucide-react';
import type { IntradayAlertSnapshot } from '@/types/intraday-alerts';
import { useAlertChime } from './useAlertChime';
import IntradayAlertsModal from './IntradayAlertsModal';

const SEEN_KEY = 'ct:intraday-alerts:last-seen';
const MUTED_KEY = 'ct:intraday-alerts:muted';
const POLL_MS = 60_000;

/**
 * Alert bell for the Daily Favorites card header. Polls the latest intraday
 * alert snapshot; glows + chimes when a fresh snapshot the user hasn't opened
 * arrives. Clicking opens the full alert modal and marks the snapshot seen.
 */
export default function IntradayAlertsBadge() {
  const [snapshot, setSnapshot] = useState<IntradayAlertSnapshot | null>(null);
  const [open, setOpen] = useState(false);
  const [muted, setMuted] = useState(false);
  const [hasUnseen, setHasUnseen] = useState(false);
  const playChime = useAlertChime();
  const lastChimedRef = useRef<string | null>(null);

  useEffect(() => {
    setMuted(localStorage.getItem(MUTED_KEY) === '1');
  }, []);

  const evaluate = useCallback(
    (snap: IntradayAlertSnapshot | null) => {
      if (!snap || snap.alerts.length === 0) {
        setHasUnseen(false);
        return;
      }
      const unseen = localStorage.getItem(SEEN_KEY) !== snap.generatedAt;
      setHasUnseen(unseen);
      // Chime once per fresh snapshot the user hasn't seen.
      if (unseen && lastChimedRef.current !== snap.generatedAt) {
        lastChimedRef.current = snap.generatedAt;
        if (localStorage.getItem(MUTED_KEY) !== '1') playChime();
      }
    },
    [playChime],
  );

  const fetchAlerts = useCallback(async () => {
    try {
      const res = await fetch('/api/intraday-alerts');
      if (!res.ok) return;
      const json = await res.json();
      const snap: IntradayAlertSnapshot | null = json?.data ?? null;
      setSnapshot(snap);
      evaluate(snap);
    } catch {
      /* ignore — keep last snapshot */
    }
  }, [evaluate]);

  useEffect(() => {
    fetchAlerts();
    const id = setInterval(fetchAlerts, POLL_MS);
    return () => clearInterval(id);
  }, [fetchAlerts]);

  const alertCount = snapshot?.alerts.length ?? 0;
  const glow = hasUnseen && alertCount > 0;

  const handleOpen = () => {
    setOpen(true);
    if (snapshot?.generatedAt) localStorage.setItem(SEEN_KEY, snapshot.generatedAt);
    setHasUnseen(false);
  };

  const toggleMute = () => {
    setMuted((m) => {
      const next = !m;
      localStorage.setItem(MUTED_KEY, next ? '1' : '0');
      return next;
    });
  };

  return (
    <>
      <button
        onClick={handleOpen}
        title="Intraday alerts"
        className={`relative flex items-center gap-1.5 px-2 py-1.5 rounded-lg transition-colors ${
          glow ? 'alert-glow bg-[#F97316]/10' : 'hover:bg-[#30363d]'
        }`}
      >
        <Bell className={`w-3.5 h-3.5 ${glow ? 'text-[#F97316]' : 'text-[#8b949e]'}`} />
        <span className={`text-[10px] font-medium hidden sm:inline ${glow ? 'text-[#F97316]' : 'text-[#8b949e]'}`}>
          Alerts
        </span>
        {alertCount > 0 && (
          <span className={`text-[10px] font-semibold num ${glow ? 'text-[#F97316]' : 'text-[#8b949e]'}`}>
            {alertCount}
          </span>
        )}
        {glow && (
          <span className="absolute -top-0.5 -right-0.5 flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#F97316] opacity-75" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[#F97316]" />
          </span>
        )}
      </button>

      <IntradayAlertsModal
        open={open}
        onClose={() => setOpen(false)}
        snapshot={snapshot}
        muted={muted}
        onToggleMute={toggleMute}
        onAdded={() => {
          /* Daily Favorites list refreshes via the ct:watchlist-updated event. */
        }}
      />
    </>
  );
}
