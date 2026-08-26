'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Bell } from 'lucide-react';
import type { IntradayAlertSnapshot } from '@/types/intraday-alerts';
import { useAlertChime } from './useAlertChime';
import IntradayAlertsModal from './IntradayAlertsModal';

const SEEN_SYMBOLS_KEY = 'ct:intraday-alerts:seen-symbols';
const MUTED_KEY = 'ct:intraday-alerts:muted';
const POLL_MS = 60_000;

/** Per-ticker "already viewed" set, scoped to one trading date. */
function loadSeenSymbols(tradingDate: string): Set<string> {
  try {
    const raw = localStorage.getItem(SEEN_SYMBOLS_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as { date?: string; symbols?: string[] };
    if (parsed.date !== tradingDate || !Array.isArray(parsed.symbols)) return new Set();
    return new Set(parsed.symbols);
  } catch {
    return new Set();
  }
}

function persistSeenSymbols(tradingDate: string, symbols: string[]) {
  if (symbols.length === 0) return;
  try {
    const merged = new Set(loadSeenSymbols(tradingDate));
    symbols.forEach((s) => merged.add(s));
    localStorage.setItem(SEEN_SYMBOLS_KEY, JSON.stringify({ date: tradingDate, symbols: [...merged] }));
  } catch {
    /* ignore — worst case a ticker re-alerts */
  }
}

/**
 * Alert bell for the Daily Favorites card header. Polls the latest intraday
 * alert snapshot; glows + chimes when it contains tickers the user hasn't
 * viewed yet. Opening the modal marks the shown tickers as viewed for the rest
 * of the trading day — later scans won't re-surface them, only new symbols.
 */
export default function IntradayAlertsBadge() {
  const [snapshot, setSnapshot] = useState<IntradayAlertSnapshot | null>(null);
  const [seenSymbols, setSeenSymbols] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState(false);
  const [muted, setMuted] = useState(false);
  const playChime = useAlertChime();
  const lastChimedRef = useRef<string | null>(null);
  const openRef = useRef(false);

  useEffect(() => {
    setMuted(localStorage.getItem(MUTED_KEY) === '1');
  }, []);

  const fetchAlerts = useCallback(async () => {
    try {
      const res = await fetch('/api/intraday-alerts');
      if (!res.ok) return;
      const json = await res.json();
      const snap: IntradayAlertSnapshot | null = json?.data ?? null;
      setSnapshot(snap);
      // Sync the seen-set to the snapshot's trading date (auto-resets on a new
      // day) — but never mid-view, so open-modal rows don't vanish under the user.
      if (snap && !openRef.current) setSeenSymbols(loadSeenSymbols(snap.tradingDate));
    } catch {
      /* ignore — keep last snapshot */
    }
  }, []);

  useEffect(() => {
    fetchAlerts();
    const id = setInterval(fetchAlerts, POLL_MS);
    return () => clearInterval(id);
  }, [fetchAlerts]);

  // Tickers already viewed in the modal are dropped everywhere: badge count,
  // glow, chime, and the modal list itself.
  const visibleAlerts = useMemo(
    () => (snapshot?.alerts ?? []).filter((a) => !seenSymbols.has(a.symbol)),
    [snapshot, seenSymbols],
  );

  // Chime once per fresh snapshot that still contains unviewed tickers.
  useEffect(() => {
    if (!snapshot || visibleAlerts.length === 0) return;
    if (lastChimedRef.current === snapshot.generatedAt) return;
    lastChimedRef.current = snapshot.generatedAt;
    if (localStorage.getItem(MUTED_KEY) !== '1') playChime();
  }, [snapshot, visibleAlerts, playChime]);

  const alertCount = visibleAlerts.length;
  const glow = alertCount > 0 && !open;

  const handleOpen = () => {
    openRef.current = true;
    setOpen(true);
    if (snapshot) {
      persistSeenSymbols(
        snapshot.tradingDate,
        visibleAlerts.map((a) => a.symbol),
      );
    }
  };

  const handleClose = () => {
    // Also mark tickers that arrived while the modal was open, then re-filter.
    if (snapshot) {
      persistSeenSymbols(
        snapshot.tradingDate,
        visibleAlerts.map((a) => a.symbol),
      );
      setSeenSymbols(loadSeenSymbols(snapshot.tradingDate));
    }
    openRef.current = false;
    setOpen(false);
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
        onClose={handleClose}
        snapshot={snapshot}
        alerts={visibleAlerts}
        muted={muted}
        onToggleMute={toggleMute}
        onAdded={() => {
          /* Daily Favorites list refreshes via the ct:watchlist-updated event. */
        }}
      />
    </>
  );
}
