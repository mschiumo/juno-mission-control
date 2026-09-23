'use client';

import { Fragment, useState, useEffect } from 'react';
import { CalendarDays, RefreshCw, TrendingUp, Landmark, Scale, Globe } from 'lucide-react';
import type { MarketEvent } from '@/app/api/market-events/route';

const TYPE_CONFIG = {
  fomc: {
    label: 'FOMC',
    bg: 'bg-[#8b5cf6]/10',
    border: 'border-[#8b5cf6]/30',
    text: 'text-[#8b5cf6]',
    icon: Landmark,
  },
  centralbank: {
    label: 'Central Bank',
    bg: 'bg-[#58a6ff]/10',
    border: 'border-[#58a6ff]/30',
    text: 'text-[#58a6ff]',
    icon: Globe,
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
  const [nextDayLabel, setNextDayLabel] = useState('Tomorrow');
  const [loading, setLoading] = useState(true);
  // "Today & tomorrow" reads naturally lowercased; a weekday ("Mon") keeps its case.
  const nextDayText = nextDayLabel === 'Tomorrow' ? 'tomorrow' : nextDayLabel;

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
        if (typeof data.nextDayLabel === 'string') setNextDayLabel(data.nextDayLabel);
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
          <span className="text-sm font-semibold text-white">Today&apos;s Events</span>
          <span className="text-[10px] text-[#8b949e] hidden sm:inline">Today &amp; {nextDayText} · FOMC · Central banks · Earnings · Gov</span>
        </div>
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
            <p className="text-xs text-[#8b949e]">No market-moving events today or {nextDayText}</p>
          </div>
        ) : (
          <div className="flex gap-2 min-w-0">
            {events.map((event, i) => {
              const cfg = TYPE_CONFIG[event.type];
              const Icon = cfg.icon;
              const isNextDay = event.daysUntil > 0;
              // Slim divider where the strip crosses from today into the next session
              const startsNextDay = isNextDay && i > 0 && events[i - 1].daysUntil === 0;

              return (
                <Fragment key={event.id}>
                  {startsNextDay && <div className="w-px flex-shrink-0 self-stretch bg-[#30363d]" aria-hidden />}
                <div
                  title={`${event.dayLabel} · ${event.label}${event.time ? ` · ${event.time}` : ''}`}
                  className={`w-44 flex-shrink-0 flex flex-col gap-1 px-3 py-2 rounded-lg border cursor-default ${cfg.bg} ${cfg.border} ${isNextDay ? 'border-dashed' : ''}`}
                >
                  {/* Type badge */}
                  <div className="flex items-center gap-1.5">
                    <Icon className={`w-3 h-3 ${cfg.text}`} />
                    <span className={`text-[9px] font-semibold uppercase tracking-wide truncate ${cfg.text}`}>
                      {cfg.label}
                    </span>
                  </div>

                  {/* Event name */}
                  <span className="text-xs font-semibold text-white leading-tight truncate">
                    {event.label}
                  </span>

                  {/* Sublabel or time + day pill for next-session events */}
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="text-[9px] text-[#8b949e] truncate">
                      {event.sublabel ?? event.time ?? ''}
                    </span>
                    {isNextDay && (
                      <span className="ml-auto flex-shrink-0 text-[8px] font-semibold uppercase tracking-wide text-[#8b949e] bg-[#30363d]/70 px-1 py-px rounded">
                        {event.dayLabel}
                      </span>
                    )}
                  </div>
                </div>
                </Fragment>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
