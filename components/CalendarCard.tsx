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
  color: string;
}

function formatTimeRange(start: string, end: string): string {
  const fmt = (d: Date) =>
    d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  return `${fmt(new Date(start))} – ${fmt(new Date(end))}`;
}

function getStatus(start: string, end: string): 'past' | 'now' | 'upcoming' {
  const now = Date.now();
  const s = new Date(start).getTime();
  const e = new Date(end).getTime();
  if (now > e) return 'past';
  if (now >= s) return 'now';
  return 'upcoming';
}

export default function CalendarCard() {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchEvents();
    const interval = setInterval(fetchEvents, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const fetchEvents = async () => {
    setLoading(true);
    setError(null);
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const res = await fetch(`/api/calendar-events?tz=${encodeURIComponent(tz)}`);
      const data = await res.json();
      if (data.success) {
        setEvents(data.data);
      } else {
        setError(data.error ?? 'Failed to load');
      }
    } catch {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  };

  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long', month: 'short', day: 'numeric',
  });

  const allDay = events.filter(e => e.allDay);
  const timed = events.filter(e => !e.allDay);

  return (
    <div className="bg-[#161b22] border border-[#30363d] rounded-xl flex flex-col h-[320px]">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#30363d] flex-shrink-0">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-[#ff6b35]/10 rounded-lg">
            <Calendar className="w-4 h-4 text-[#ff6b35]" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-white leading-tight">Today</h2>
            <p className="text-[10px] text-[#8b949e]">{today}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-[#8b949e]">
            {events.length} event{events.length !== 1 ? 's' : ''}
          </span>
          <button
            onClick={fetchEvents}
            disabled={loading}
            className="p-1 hover:bg-[#30363d] rounded transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-[#8b949e] ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Event list — scrollable */}
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-1.5">
        {loading && events.length === 0 ? (
          <div className="flex items-center justify-center h-full text-[#8b949e] text-xs gap-2">
            <RefreshCw className="w-3.5 h-3.5 animate-spin text-[#ff6b35]" />
            Loading...
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <p className="text-xs text-[#8b949e]">{error}</p>
            <button onClick={fetchEvents} className="mt-1 text-[10px] text-[#ff6b35] hover:underline">
              Retry
            </button>
          </div>
        ) : events.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center gap-1">
            <Calendar className="w-6 h-6 text-[#238636] opacity-60" />
            <p className="text-xs text-white font-medium">Free day</p>
            <p className="text-[10px] text-[#8b949e]">Nothing scheduled</p>
          </div>
        ) : (
          <>
            {allDay.map(event => (
              <div key={event.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-[#0d1117] border border-[#30363d]">
                <div className="w-0.5 h-4 rounded-full flex-shrink-0" style={{ backgroundColor: event.color }} />
                <span className="text-xs text-white flex-1 truncate">{event.title}</span>
                <span className="text-[10px] text-[#8b949e]">All day</span>
              </div>
            ))}
            {timed.map(event => {
              const status = getStatus(event.start, event.end);
              return (
                <div
                  key={event.id}
                  className={`flex items-start gap-2 px-2 py-2 rounded-lg border transition-colors ${
                    status === 'now'
                      ? 'bg-[#ff6b35]/5 border-[#ff6b35]/40'
                      : status === 'past'
                      ? 'bg-[#0d1117] border-[#30363d] opacity-40'
                      : 'bg-[#0d1117] border-[#30363d]'
                  }`}
                >
                  <div className="w-0.5 rounded-full flex-shrink-0 mt-0.5 min-h-[28px]" style={{ backgroundColor: event.color }} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1">
                      <p className="text-xs font-medium text-white truncate">{event.title}</p>
                      {status === 'now' && (
                        <span className="text-[9px] px-1 py-0.5 rounded-full bg-[#ff6b35]/20 text-[#ff6b35] font-medium flex-shrink-0">
                          Now
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1 mt-0.5 text-[10px] text-[#8b949e]">
                      <Clock className="w-2.5 h-2.5" />
                      {formatTimeRange(event.start, event.end)}
                    </div>
                    {event.location && (
                      <div className="flex items-center gap-1 mt-0.5 text-[10px] text-[#8b949e]">
                        <MapPin className="w-2.5 h-2.5" />
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
      <div className="px-4 py-2 border-t border-[#30363d] flex-shrink-0">
        <a
          href="https://calendar.google.com"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-1 text-[10px] text-[#8b949e] hover:text-[#ff6b35] transition-colors"
        >
          <ExternalLink className="w-2.5 h-2.5" />
          Open Google Calendar
        </a>
      </div>
    </div>
  );
}
