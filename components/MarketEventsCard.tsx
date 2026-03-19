'use client';

import { useState, useEffect } from 'react';
import { CalendarDays, RefreshCw, TrendingUp, Landmark, Scale } from 'lucide-react';
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

export default function MarketEventsCard() {
  const [events, setEvents] = useState<MarketEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchEvents();
  }, []);

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

  return (
    <div className="bg-[#161b22] border border-[#30363d] rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#30363d] bg-[#0d1117]/50">
        <div className="flex items-center gap-2">
          <CalendarDays className="w-4 h-4 text-[#F97316]" />
          <span className="text-sm font-semibold text-white">Today's Events</span>
          <span className="text-[10px] text-[#8b949e]">FOMC · Earnings · Gov</span>
        </div>
        <button
          onClick={fetchEvents}
          disabled={loading}
          className="p-1.5 hover:bg-[#30363d] rounded-lg transition-colors disabled:opacity-50"
          title="Refresh events"
        >
          <RefreshCw className={`w-3.5 h-3.5 text-[#8b949e] hover:text-[#F97316] ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Events - horizontal scrollable strip */}
      <div className="px-4 py-3 overflow-x-auto scrollbar-hide">
        {loading ? (
          <div className="flex items-center gap-2 text-[#8b949e] py-1">
            <RefreshCw className="w-4 h-4 animate-spin text-[#F97316]" />
            <span className="text-xs">Loading events...</span>
          </div>
        ) : events.length === 0 ? (
          <div className="flex items-center gap-2 py-1">
            <CalendarDays className="w-3.5 h-3.5 text-[#8b949e] opacity-50" />
            <p className="text-xs text-[#8b949e]">No market-moving events today</p>
          </div>
        ) : (
          <div className="flex gap-2 min-w-0">
            {events.map((event) => {
              const cfg = TYPE_CONFIG[event.type];
              const Icon = cfg.icon;

              return (
                <div
                  key={event.id}
                  className={`flex-shrink-0 flex flex-col gap-1 px-3 py-2 rounded-lg border ${cfg.bg} ${cfg.border}`}
                >
                  {/* Type badge */}
                  <div className="flex items-center gap-1.5">
                    <Icon className={`w-3 h-3 ${cfg.text}`} />
                    <span className={`text-[9px] font-semibold uppercase tracking-wide ${cfg.text}`}>
                      {cfg.label}
                    </span>
                  </div>

                  {/* Event name */}
                  <span className="text-xs font-semibold text-white leading-tight">
                    {event.label}
                  </span>

                  {/* Sublabel */}
                  {event.sublabel && (
                    <span className="text-[9px] text-[#8b949e]">{event.sublabel}</span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
