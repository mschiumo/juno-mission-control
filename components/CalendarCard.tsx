'use client';

import { useState, useEffect } from 'react';
import { Calendar, Clock, MapPin, RefreshCw, ExternalLink } from 'lucide-react';

interface CalendarEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  location: string;
  description: string;
  color: string;
}

function formatTimeRange(start: string, end: string): string {
  const s = new Date(start);
  const e = new Date(end);
  const fmt = (d: Date) =>
    d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  return `${fmt(s)} – ${fmt(e)}`;
}

function getStatus(start: string, end: string): 'past' | 'now' | 'upcoming' {
  const now = Date.now();
  const s = new Date(start).getTime();
  const e = new Date(end).getTime();
  if (now > e) return 'past';
  if (now >= s) return 'now';
  return 'upcoming';
}

function todayLabel(): string {
  return new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}

export default function CalendarCard() {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  useEffect(() => {
    fetchEvents();
    const interval = setInterval(fetchEvents, 5 * 60 * 1000); // refresh every 5 min
    return () => clearInterval(interval);
  }, []);

  const fetchEvents = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/calendar-events');
      const data = await res.json();
      if (data.success) {
        setEvents(data.data);
        setLastUpdated(new Date());
      } else {
        setError(data.error ?? 'Failed to load events');
      }
    } catch {
      setError('Network error — check your connection');
    } finally {
      setLoading(false);
    }
  };

  const allDayEvents = events.filter(e => e.allDay);
  const timedEvents = events.filter(e => !e.allDay);

  return (
    <div className="bg-[#161b22] border border-[#30363d] rounded-xl overflow-hidden flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-[#30363d] bg-[#0d1117]/50">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-[#ff6b35]/10 rounded-lg">
            <Calendar className="w-5 h-5 text-[#ff6b35]" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-white">Today</h2>
            <p className="text-xs text-[#8b949e]">{todayLabel()}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {lastUpdated && !loading && (
            <span className="text-[10px] text-[#8b949e]">
              {events.length} event{events.length !== 1 ? 's' : ''}
            </span>
          )}
          <button
            onClick={fetchEvents}
            disabled={loading}
            className="p-1.5 hover:bg-[#30363d] rounded-lg transition-colors disabled:opacity-50"
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 text-[#8b949e] hover:text-[#ff6b35] ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-2 max-h-[420px]">
        {loading && events.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-[#8b949e]">
            <RefreshCw className="w-6 h-6 animate-spin mb-2 text-[#ff6b35]" />
            <span className="text-sm">Loading calendar...</span>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <Calendar className="w-8 h-8 text-[#8b949e] mb-2 opacity-50" />
            <p className="text-sm text-[#8b949e]">{error}</p>
            <button onClick={fetchEvents} className="mt-2 text-xs text-[#ff6b35] hover:underline">
              Try again
            </button>
          </div>
        ) : events.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <div className="w-12 h-12 rounded-full bg-[#238636]/10 flex items-center justify-center mb-3">
              <Calendar className="w-6 h-6 text-[#238636]" />
            </div>
            <p className="text-sm font-medium text-white">Nothing scheduled today</p>
            <p className="text-xs text-[#8b949e] mt-1">Enjoy the free time</p>
          </div>
        ) : (
          <>
            {/* All-day events */}
            {allDayEvents.map(event => (
              <div
                key={event.id}
                className="flex items-center gap-3 px-3 py-2 rounded-lg bg-[#0d1117] border border-[#30363d]"
              >
                <div className="w-1 self-stretch rounded-full flex-shrink-0" style={{ backgroundColor: event.color }} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate">{event.title}</p>
                  <p className="text-[10px] text-[#8b949e] mt-0.5">All day</p>
                </div>
              </div>
            ))}

            {/* Timed events */}
            {timedEvents.map(event => {
              const status = getStatus(event.start, event.end);
              return (
                <div
                  key={event.id}
                  className={`flex items-start gap-3 px-3 py-3 rounded-lg border transition-colors ${
                    status === 'now'
                      ? 'bg-[#ff6b35]/5 border-[#ff6b35]/40'
                      : status === 'past'
                      ? 'bg-[#0d1117] border-[#30363d] opacity-50'
                      : 'bg-[#0d1117] border-[#30363d] hover:border-[#ff6b35]/30'
                  }`}
                >
                  {/* Color bar */}
                  <div
                    className="w-1 rounded-full flex-shrink-0 mt-0.5"
                    style={{ backgroundColor: event.color, minHeight: '36px' }}
                  />

                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className={`text-sm font-medium truncate ${status === 'past' ? 'text-[#8b949e]' : 'text-white'}`}>
                        {event.title}
                      </p>
                      {status === 'now' && (
                        <span className="flex-shrink-0 text-[10px] px-1.5 py-0.5 rounded-full bg-[#ff6b35]/20 text-[#ff6b35] font-medium">
                          Now
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1 mt-1 text-xs text-[#8b949e]">
                      <Clock className="w-3 h-3 flex-shrink-0" />
                      <span>{formatTimeRange(event.start, event.end)}</span>
                    </div>

                    {event.location && (
                      <div className="flex items-center gap-1 mt-0.5 text-xs text-[#8b949e]">
                        <MapPin className="w-3 h-3 flex-shrink-0" />
                        <span className="truncate">{event.location}</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </>
        )}
      </div>

      {/* Footer */}
      <div className="px-5 py-3 border-t border-[#30363d]">
        <a
          href="https://calendar.google.com"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-1.5 text-xs text-[#8b949e] hover:text-[#ff6b35] transition-colors"
        >
          <ExternalLink className="w-3 h-3" />
          Open Google Calendar
        </a>
      </div>
    </div>
  );
}
