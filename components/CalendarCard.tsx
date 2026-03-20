'use client';

import { useState, useEffect, useRef } from 'react';
import { Calendar, Clock, MapPin, RefreshCw, ExternalLink, X, AlignLeft, Trash2, Link } from 'lucide-react';

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

interface LaidEvent extends CalendarEvent {
  col: number;
  numCols: number;
}

const PX_PER_HOUR = 56;

function localMinuteOfDay(iso: string): number {
  const d = new Date(iso);
  return d.getHours() * 60 + d.getMinutes();
}

function nowMinutes(): number {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

function hourLabel(h: number): string {
  if (h === 0) return '';
  if (h < 12) return `${h} AM`;
  if (h === 12) return '12 PM';
  return `${h - 12} PM`;
}

function layoutEvents(events: CalendarEvent[]): LaidEvent[] {
  if (!events.length) return [];
  const sorted = [...events].sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());

  // Greedy interval-graph column coloring
  const colEnds: Date[] = [];
  const assignments = sorted.map(event => {
    const start = new Date(event.start);
    const end = new Date(event.end);
    let col = colEnds.findIndex(e => e <= start);
    if (col === -1) { col = colEnds.length; colEnds.push(end); }
    else colEnds[col] = end;
    return { event, col };
  });

  // Compute numCols per event = max column among all events overlapping it + 1
  return assignments.map(({ event, col }) => {
    const s = new Date(event.start);
    const e = new Date(event.end);
    const overlapping = assignments.filter(({ event: o }) => s < new Date(o.end) && e > new Date(o.start));
    const numCols = Math.max(...overlapping.map(o => o.col)) + 1;
    return { ...event, col, numCols };
  });
}

export default function CalendarCard() {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<CalendarEvent | null>(null);
  const [now, setNow] = useState(nowMinutes);
  const [noCalendar, setNoCalendar] = useState(false);
  const [icalInput, setIcalInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchEvents();
    const fetchTimer = setInterval(fetchEvents, 5 * 60 * 1000);
    const nowTimer = setInterval(() => setNow(nowMinutes()), 60_000);
    return () => { clearInterval(fetchTimer); clearInterval(nowTimer); };
  }, []);

  // Auto-scroll: keep current time 80px from the top of the visible area.
  // Depends on both `now` (fires every minute) and `loading` (fires once events render).
  useEffect(() => {
    if (scrollRef.current && !loading && !noCalendar) {
      const target = (now / 60) * PX_PER_HOUR - 80;
      scrollRef.current.scrollTop = Math.max(0, target);
    }
  }, [now, loading, noCalendar]);

  const fetchEvents = async () => {
    setLoading(true);
    setError(null);
    setNoCalendar(false);
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const res = await fetch(`/api/calendar-events?tz=${encodeURIComponent(tz)}`);
      const data = await res.json();
      if (data.noCalendar) {
        setNoCalendar(true);
        setEvents([]);
      } else if (data.success) {
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

  const handleConnect = async () => {
    if (!icalInput.trim()) return;
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch('/api/user/prefs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ calendarUrl: icalInput.trim() }),
      });
      const data = await res.json();
      if (data.success) {
        setIcalInput('');
        await fetchEvents();
      } else {
        setSaveError(data.error ?? 'Failed to save');
      }
    } catch {
      setSaveError('Network error');
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async () => {
    setRemoving(true);
    try {
      await fetch('/api/user/prefs', { method: 'DELETE' });
      await fetchEvents();
    } catch {
      // silently ignore
    } finally {
      setRemoving(false);
    }
  };

  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
  const allDay = events.filter(e => e.allDay);
  const timed = layoutEvents(events.filter(e => !e.allDay));
  const nowTop = (now / 60) * PX_PER_HOUR;

  // Empty state: no calendar configured
  if (!loading && noCalendar) {
    return (
      <div className="bg-[#161b22] border border-[#30363d] rounded-xl flex flex-col h-full relative overflow-hidden">
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
          <button onClick={fetchEvents} disabled={loading} className="p-1 hover:bg-[#30363d] rounded transition-colors disabled:opacity-50">
            <RefreshCw className={`w-3.5 h-3.5 text-[#8b949e] ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* No-calendar empty state */}
        <div className="flex-1 flex flex-col items-center justify-center px-5 py-6 text-center gap-4">
          <div className="p-3 bg-[#ff6b35]/10 rounded-full">
            <Calendar className="w-6 h-6 text-[#ff6b35]" />
          </div>
          <div className="space-y-1">
            <h3 className="text-sm font-semibold text-white">No Calendar Connected</h3>
            <p className="text-[10px] text-[#8b949e] leading-relaxed max-w-[240px]">
              Paste a Google Calendar iCal link below. In Google Calendar, go to{' '}
              <span className="text-[#ff6b35]">Settings</span> &rarr; your calendar &rarr; scroll to{' '}
              <span className="text-[#ff6b35]">&ldquo;Integrate calendar&rdquo;</span> &rarr; copy the{' '}
              <span className="text-[#ff6b35]">&ldquo;Public address in iCal format&rdquo;</span> URL.
            </p>
          </div>
          <div className="w-full space-y-2">
            <input
              type="url"
              value={icalInput}
              onChange={e => setIcalInput(e.target.value)}
              placeholder="https://calendar.google.com/calendar/ical/..."
              className="w-full bg-[#0d1117] border border-[#30363d] rounded-lg px-3 py-2 text-[11px] text-white placeholder-[#8b949e] focus:outline-none focus:border-[#ff6b35] transition-colors"
              onKeyDown={e => { if (e.key === 'Enter') handleConnect(); }}
            />
            {saveError && <p className="text-[10px] text-[#ef4444]">{saveError}</p>}
            <button
              onClick={handleConnect}
              disabled={saving || !icalInput.trim()}
              className="w-full flex items-center justify-center gap-1.5 bg-[#ff6b35] hover:bg-[#ff6b35]/90 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-medium rounded-lg px-3 py-2 transition-colors"
            >
              {saving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Link className="w-3.5 h-3.5" />}
              {saving ? 'Connecting...' : 'Connect'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-[#161b22] border border-[#30363d] rounded-xl flex flex-col h-full relative overflow-hidden">

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
        <div className="flex items-center gap-1">
          <span className="text-[10px] text-[#8b949e]">{events.length} event{events.length !== 1 ? 's' : ''}</span>
          <button onClick={fetchEvents} disabled={loading} className="p-1 hover:bg-[#30363d] rounded transition-colors disabled:opacity-50">
            <RefreshCw className={`w-3.5 h-3.5 text-[#8b949e] ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={handleRemove}
            disabled={removing}
            title="Remove calendar"
            className="p-1 hover:bg-[#30363d] rounded transition-colors disabled:opacity-50 text-[#8b949e] hover:text-[#ef4444]"
          >
            <Trash2 className={`w-3.5 h-3.5 ${removing ? 'animate-pulse' : ''}`} />
          </button>
        </div>
      </div>

      {/* All-day events strip */}
      {allDay.length > 0 && (
        <div className="flex-shrink-0 border-b border-[#30363d] px-3 py-1.5 flex flex-col gap-1">
          {allDay.map(e => (
            <button
              key={e.id}
              onClick={() => setSelected(e)}
              className="flex items-center gap-1.5 w-full text-left hover:opacity-80 transition-opacity"
            >
              <div className="w-1.5 h-3.5 rounded-sm flex-shrink-0" style={{ backgroundColor: e.color }} />
              <span className="text-[10px] text-white font-medium truncate">{e.title}</span>
              <span className="text-[10px] text-[#8b949e] ml-auto flex-shrink-0">All day</span>
            </button>
          ))}
        </div>
      )}

      {/* Timeline */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        {loading && events.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-[#8b949e] text-xs gap-2">
            <RefreshCw className="w-3.5 h-3.5 animate-spin text-[#ff6b35]" /> Loading...
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center h-32 text-center gap-1">
            <p className="text-xs text-[#8b949e]">{error}</p>
            <button onClick={fetchEvents} className="text-[10px] text-[#ff6b35] hover:underline">Retry</button>
          </div>
        ) : (
          <div className="relative select-none" style={{ height: 24 * PX_PER_HOUR }}>

            {/* Hour rows */}
            {Array.from({ length: 24 }, (_, i) => (
              <div key={i} className="absolute w-full flex items-start" style={{ top: i * PX_PER_HOUR, height: PX_PER_HOUR }}>
                <span className="w-12 text-[9px] text-[#8b949e] text-right pr-2 flex-shrink-0 -mt-[7px] leading-none">
                  {hourLabel(i)}
                </span>
                <div className="flex-1 border-t border-[#30363d]/60" />
              </div>
            ))}

            {/* Half-hour lines */}
            {Array.from({ length: 24 }, (_, i) => (
              <div key={`h${i}`} className="absolute w-full flex items-start pointer-events-none"
                style={{ top: i * PX_PER_HOUR + PX_PER_HOUR / 2 }}>
                <div className="w-12 flex-shrink-0" />
                <div className="flex-1 border-t border-[#30363d]/25" />
              </div>
            ))}

            {/* Current time indicator */}
            <div className="absolute w-full flex items-center pointer-events-none z-20" style={{ top: nowTop }}>
              <div className="w-12 flex justify-end pr-1.5 flex-shrink-0">
                <div className="w-2 h-2 rounded-full bg-[#ef4444]" />
              </div>
              <div className="flex-1 border-t-2 border-[#ef4444]" />
            </div>

            {/* Timed events */}
            {timed.map(event => {
              const startMin = localMinuteOfDay(event.start);
              const endMin = localMinuteOfDay(event.end);
              const durMin = Math.max(endMin > startMin ? endMin - startMin : 30, 20);
              const top = (startMin / 60) * PX_PER_HOUR;
              const height = Math.max((durMin / 60) * PX_PER_HOUR, 18);
              const colWidth = `calc((100% - 3rem) / ${event.numCols} - 2px)`;
              const left = `calc(3rem + (100% - 3rem) / ${event.numCols} * ${event.col} + ${event.col}px)`;
              const isShort = height < 32;

              return (
                <button
                  key={event.id}
                  onClick={() => setSelected(event)}
                  className="absolute text-left rounded overflow-hidden px-1.5 py-0.5 hover:brightness-110 transition-all z-10"
                  style={{
                    top,
                    left,
                    width: colWidth,
                    height,
                    backgroundColor: event.color + '30',
                    borderLeft: `2.5px solid ${event.color}`,
                  }}
                >
                  <p className="text-[10px] font-semibold text-white leading-tight truncate">{event.title}</p>
                  {!isShort && (
                    <p className="text-[9px] text-[#8b949e] leading-tight truncate">
                      {fmtTime(event.start)} – {fmtTime(event.end)}
                    </p>
                  )}
                </button>
              );
            })}

            {/* Empty state overlay */}
            {events.length === 0 && !loading && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 pointer-events-none">
                <Calendar className="w-5 h-5 text-[#238636] opacity-50" />
                <p className="text-xs text-[#8b949e]">Nothing scheduled today</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex-shrink-0 px-4 py-2 border-t border-[#30363d]">
        <a href="https://calendar.google.com" target="_blank" rel="noopener noreferrer"
          className="flex items-center justify-center gap-1 text-[10px] text-[#8b949e] hover:text-[#ff6b35] transition-colors">
          <ExternalLink className="w-2.5 h-2.5" />
          Open Google Calendar
        </a>
      </div>

      {/* Event detail overlay */}
      {selected && (
        <div
          className="absolute inset-0 z-30 flex items-center justify-center bg-black/70 rounded-xl p-4"
          onClick={() => setSelected(null)}
        >
          <div
            className="bg-[#161b22] border border-[#30363d] rounded-xl p-4 w-full max-h-full overflow-y-auto shadow-xl"
            onClick={e => e.stopPropagation()}
          >
            {/* Modal header */}
            <div className="flex items-start justify-between gap-2 mb-3">
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-3 h-3 rounded-sm flex-shrink-0 mt-0.5" style={{ backgroundColor: selected.color }} />
                <h3 className="text-sm font-semibold text-white leading-snug">{selected.title}</h3>
              </div>
              <button onClick={() => setSelected(null)} className="p-1 hover:bg-[#30363d] rounded transition-colors flex-shrink-0">
                <X className="w-3.5 h-3.5 text-[#8b949e]" />
              </button>
            </div>

            <div className="space-y-2">
              {/* Time */}
              <div className="flex items-center gap-2 text-xs text-[#8b949e]">
                <Clock className="w-3.5 h-3.5 flex-shrink-0" />
                <span>{selected.allDay ? 'All day' : `${fmtTime(selected.start)} – ${fmtTime(selected.end)}`}</span>
              </div>

              {/* Location */}
              {selected.location && (
                <div className="flex items-start gap-2 text-xs text-[#8b949e]">
                  <MapPin className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                  <span>{selected.location}</span>
                </div>
              )}

              {/* Description / notes */}
              {selected.description && (
                <div className="flex items-start gap-2 text-xs text-[#8b949e]">
                  <AlignLeft className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                  <span className="whitespace-pre-wrap break-words">{selected.description}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
