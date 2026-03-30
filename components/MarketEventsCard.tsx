'use client';

import { useState, useEffect } from 'react';
import { CalendarDays, RefreshCw, TrendingUp, Landmark, Scale, Newspaper } from 'lucide-react';
import type { MarketEvent } from '@/app/api/market-events/route';

const TYPE_CONFIG = {
  fomc: {
    label: 'FOMC',
    bg: 'bg-[#8b5cf6]/10',
    border: 'border-[#8b5cf6]/30',
    text: 'text-[#8b5cf6]',
    icon: Landmark,
  },
  earnings: {
    label: 'Earnings',
    bg: 'bg-[#14b8a6]/10',
    border: 'border-[#14b8a6]/30',
    text: 'text-[#14b8a6]',
    icon: TrendingUp,
  },
  gov: {
    label: 'Gov',
    bg: 'bg-[#d29922]/10',
    border: 'border-[#d29922]/30',
    text: 'text-[#d29922]',
    icon: Scale,
  },
};

const BRIEFING_READ_KEY = 'market_briefing_last_read';

interface MarketEventsCardProps {
  onOpenBriefing?: () => void;
}

export default function MarketEventsCard({ onOpenBriefing }: MarketEventsCardProps) {
  const [events, setEvents] = useState<MarketEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasUnreadBriefing, setHasUnreadBriefing] = useState(false);

  useEffect(() => {
    fetchEvents();
  }, []);

  // Check for unread briefing on mount
  useEffect(() => {
    if (!onOpenBriefing) return;
    fetch('/api/market-briefing')
      .then((r) => r.json())
      .then((data) => {
        if (data.success && data.briefing?.generatedAt) {
          const lastRead = localStorage.getItem(BRIEFING_READ_KEY);
          if (!lastRead || lastRead !== data.briefing.generatedAt) {
            setHasUnreadBriefing(true);
          }
        }
      })
      .catch(() => {});
  }, [onOpenBriefing]);

  const fetchEvents = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/market-events');
      const data = await res.json();
      if (data.success) {
        setEvents(data.data);
      }
    } catch (err) {
      console.error('Failed to fetch market events:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenBriefing = () => {
    // Mark as read
    fetch('/api/market-briefing')
      .then((r) => r.json())
      .then((data) => {
        if (data.success && data.briefing?.generatedAt) {
          localStorage.setItem(BRIEFING_READ_KEY, data.briefing.generatedAt);
        }
      })
      .catch(() => {});
    setHasUnreadBriefing(false);
    onOpenBriefing?.();
  };

  return (
    <div className="bg-[#111318] border border-white/[0.06] rounded-2xl shadow-xl shadow-black/20 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06] bg-[#09090b]/50">
        <div className="flex items-center gap-2">
          <CalendarDays className="w-4 h-4 text-[#F97316]" />
          <span className="text-sm font-semibold text-white">Today&apos;s Events</span>
          <span className="text-[10px] text-[#71717a]">FOMC · Earnings · Gov</span>
        </div>
        <div className="flex items-center gap-1">
          {onOpenBriefing && (
            <button
              data-tour="market-briefing"
              onClick={handleOpenBriefing}
              className="relative flex items-center gap-1.5 px-2 py-1.5 hover:bg-white/[0.06] rounded-lg transition-colors"
              title="Morning Market Briefing"
            >
              <Newspaper className="w-3.5 h-3.5 text-[#F97316]" />
              <span className="text-[10px] font-medium text-[#71717a] hidden sm:inline">Briefing</span>
              {hasUnreadBriefing && (
                <span className="absolute -top-0.5 -right-0.5 flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#F97316] opacity-75" />
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[#F97316]" />
                </span>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Events - horizontal scrollable strip */}
      <div className="px-4 py-3 overflow-x-auto scrollbar-hide">
        {loading ? (
          <div className="flex items-center gap-2 text-[#71717a] py-1">
            <RefreshCw className="w-4 h-4 animate-spin text-[#F97316]" />
            <span className="text-xs">Loading events...</span>
          </div>
        ) : events.length === 0 ? (
          <div className="flex items-center gap-2 py-1">
            <CalendarDays className="w-3.5 h-3.5 text-[#71717a] opacity-50" />
            <p className="text-xs text-[#71717a]">No market-moving events today</p>
          </div>
        ) : (
          <div className="flex gap-2 min-w-0">
            {events.map((event) => {
              const cfg = TYPE_CONFIG[event.type];
              const Icon = cfg.icon;

              return (
                <div
                  key={event.id}
                  title={event.time ? `${event.label} · ${event.time}` : event.label}
                  className={`w-36 flex-shrink-0 flex flex-col gap-1 px-3 py-2 rounded-lg border cursor-default ${cfg.bg} ${cfg.border}`}
                >
                  {/* Type badge */}
                  <div className="flex items-center gap-1.5">
                    <Icon className={`w-3 h-3 ${cfg.text}`} />
                    <span className={`text-[9px] font-semibold uppercase tracking-wide ${cfg.text}`}>
                      {cfg.label}
                    </span>
                  </div>

                  {/* Event name */}
                  <span className="text-xs font-semibold text-white leading-tight truncate">
                    {event.label}
                  </span>

                  {/* Sublabel or time */}
                  <span className="text-[9px] text-[#71717a] truncate">
                    {event.sublabel ?? event.time ?? ''}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
