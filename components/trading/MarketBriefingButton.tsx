'use client';

import { useState, useEffect } from 'react';
import { Newspaper } from 'lucide-react';
import MarketBriefingModal from '@/components/MarketBriefingModal';

const BRIEFING_READ_KEY = 'market_briefing_last_read';

/**
 * Opens the Morning Market Briefing. Sized to sit beside the MarketTickerBar
 * (h-12); a pulsing dot marks a briefing the user hasn't opened yet.
 */
export default function MarketBriefingButton() {
  const [open, setOpen] = useState(false);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [hasUnread, setHasUnread] = useState(false);

  useEffect(() => {
    fetch('/api/market-briefing')
      .then((r) => r.json())
      .then((data) => {
        const at = data.success ? data.briefing?.generatedAt : null;
        if (!at) return;
        setGeneratedAt(at);
        try {
          if (localStorage.getItem(BRIEFING_READ_KEY) !== at) setHasUnread(true);
        } catch {}
      })
      .catch(() => {});
  }, []);

  const handleOpen = () => {
    if (generatedAt) {
      try {
        localStorage.setItem(BRIEFING_READ_KEY, generatedAt);
      } catch {}
    }
    setHasUnread(false);
    setOpen(true);
  };

  return (
    <>
      <button
        data-tour="market-briefing"
        onClick={handleOpen}
        className="relative flex items-center gap-2 px-4 h-12 shrink-0 bg-[#0d1117] border border-[#30363d] rounded-xl hover:bg-[#161b22] hover:border-[#F97316]/50 transition-colors"
        title="Morning Market Briefing"
        aria-label="Open Morning Market Briefing"
      >
        <Newspaper className="w-4 h-4 text-[#F97316]" />
        <span className="text-xs font-semibold text-white hidden sm:inline">Briefing</span>
        {hasUnread && (
          <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#F97316] opacity-75" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[#F97316]" />
          </span>
        )}
      </button>
      <MarketBriefingModal isOpen={open} onClose={() => setOpen(false)} />
    </>
  );
}
