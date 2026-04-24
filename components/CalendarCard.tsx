'use client';

import { useState, useEffect, useRef } from 'react';
import { Calendar, Clock, MapPin, RefreshCw, ExternalLink, X, AlignLeft, Trash2, Link, ChevronLeft, ChevronRight, Globe, Copy, Settings } from 'lucide-react';

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
const DISPLAY_TZ = 'America/New_York';

function minuteOfDayInEST(date: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: DISPLAY_TZ,
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
  }).formatToParts(date);
  const h = parseInt(parts.find(p => p.type === 'hour')?.value ?? '0', 10);
  const m = parseInt(parts.find(p => p.type === 'minute')?.value ?? '0', 10);
  return (isNaN(h) ? 0 : h % 24) * 60 + (isNaN(m) ? 0 : m);
}

function localMinuteOfDay(iso: string): number {
  return minuteOfDayInEST(new Date(iso));
}

function nowMinutes(): number {
  return minuteOfDayInEST(new Date());
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: DISPLAY_TZ });
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

  const colEnds: Date[] = [];
  const assignments = sorted.map(event => {
    const start = new Date(event.start);
    const end = new Date(event.end);
    let col = colEnds.findIndex(e => e <= start);
    if (col === -1) { col = colEnds.length; colEnds.push(end); }
    else colEnds[col] = end;
    return { event, col };
  });

  return assignments.map(({ event, col }) => {
    const s = new Date(event.start);
    const e = new Date(event.end);
    const overlapping = assignments.filter(({ event: o }) => s < new Date(o.end) && e > new Date(o.start));
    const numCols = Math.max(...overlapping.map(o => o.col)) + 1;
    return { ...event, col, numCols };
  });
}

const SETUP_STEPS = [
  {
    icon: Settings,
    title: 'Open Google Calendar Settings',
    description: (
      <>
        Go to{' '}
        <a href="https://calendar.google.com" target="_blank" rel="noopener noreferrer"
          className="text-[#ff6b35] hover:underline">calendar.google.com
        </a>{' '}
        and click the <span className="text-white font-medium">gear icon ⚙</span> in the top-right corner, then select{' '}
        <span className="text-white font-medium">Settings</span>.
      </>
    ),
  },
  {
    icon: Calendar,
    title: 'Select Your Calendar',
    description: (
      <>
        In the left sidebar, find your calendar under{' '}
        <span className="text-white font-medium">&ldquo;My calendars&rdquo;</span> and click on its name to open
        its individual settings page.
      </>
    ),
  },
  {
    icon: Globe,
    title: 'Make It Public',
    description: (
      <>
        Scroll down to <span className="text-white font-medium">&ldquo;Access permissions for events&rdquo;</span>{' '}
        and check <span className="text-white font-medium">&ldquo;Make available to public&rdquo;</span>. Click OK
        to confirm. This is required for the iCal feed to work.
      </>
    ),
  },
  {
    icon: Copy,
    title: 'Copy the iCal URL',
    description: (
      <>
        Scroll down to <span className="text-white font-medium">&ldquo;Integrate calendar&rdquo;</span> and copy the{' '}
        <span className="text-white font-medium">&ldquo;Public address in iCal format&rdquo;</span> URL.{' '}
        It looks like:{' '}
        <span className="text-[#ff6b35] font-mono text-[10px] break-all">
          calendar.google.com/calendar/ical/.../.../basic.ics
        </span>
        <br /><br />
        <span className="text-[#ef4444]">Do not use</span> the &ldquo;Share with specific people&rdquo; link — it won&apos;t work.
      </>
    ),
  },
];

function getDateStringForOffset(offset: number): string {
  // Get today's date in EST, then apply day offset
  const todayEST = new Date().toLocaleDateString('en-CA', { timeZone: DISPLAY_TZ }); // "YYYY-MM-DD"
  const [y, mo, d] = todayEST.split('-').map(Number);
  const shifted = new Date(Date.UTC(y, mo - 1, d + offset));
  return shifted.toISOString().slice(0, 10); // "YYYY-MM-DD"
}

function getDayLabel(offset: number): string {
  if (offset === 0) return 'Today';
  if (offset === -1) return 'Yesterday';
  if (offset === 1) return 'Tomorrow';
  const dateStr = getDateStringForOffset(offset);
  const [y, mo, d] = dateStr.split('-').map(Number);
  const date = new Date(Date.UTC(y, mo - 1, d));
  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
}

function getDateSubtitle(offset: number): string {
  const dateStr = getDateStringForOffset(offset);
  const [y, mo, d] = dateStr.split('-').map(Number);
  const date = new Date(Date.UTC(y, mo - 1, d));
  return date.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', timeZone: 'UTC' });
}

export default function CalendarCard() {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<CalendarEvent | null>(null);
  const [now, setNow] = useState(nowMinutes);
  const [dayOffset, setDayOffset] = useState(0);
  const [noCalendar, setNoCalendar] = useState(false);
  const [icalInput, setIcalInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);
  const [showSetupModal, setShowSetupModal] = useState(false);
  const [setupStep, setSetupStep] = useState(0);
  const [justConnected, setJustConnected] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    fetchEvents();
    const fetchTimer = setInterval(fetchEvents, 5 * 60 * 1000);
    const nowTimer = setInterval(() => setNow(nowMinutes()), 60_000);
    return () => { clearInterval(fetchTimer); clearInterval(nowTimer); };
  }, [dayOffset]);

  useEffect(() => {
    if (scrollRef.current && !loading && !noCalendar) {
      if (dayOffset === 0) {
        const target = (now / 60) * PX_PER_HOUR - 80;
        scrollRef.current.scrollTop = Math.max(0, target);
      } else {
        scrollRef.current.scrollTop = Math.max(0, 8 * PX_PER_HOUR - 80);
      }
    }
  }, [now, loading, noCalendar, dayOffset]);

  const fetchEvents = async () => {
    setLoading(true);
    setError(null);
    setNoCalendar(false);
    try {
      const tz = DISPLAY_TZ;
      const date = getDateStringForOffset(dayOffset);
      const res = await fetch(`/api/calendar-events?tz=${encodeURIComponent(tz)}&date=${date}`);
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
        setShowSetupModal(false);
        setSetupStep(0);
        setJustConnected(true);
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
      setJustConnected(false);
      await fetchEvents();
    } catch {
      // silently ignore
    } finally {
      setRemoving(false);
    }
  };

  const allDay = events.filter(e => e.allDay);
  const timed = layoutEvents(events.filter(e => !e.allDay));
  const nowTop = (now / 60) * PX_PER_HOUR;

  const totalSteps = SETUP_STEPS.length + 1; // +1 for the connect step

  return (
    <div className="bg-[#161b22] border border-[#30363d] rounded-xl flex flex-col h-full relative overflow-hidden">

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#30363d] flex-shrink-0">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-[#ff6b35]/10 rounded-lg flex-shrink-0">
            <Calendar className="w-4 h-4 text-[#ff6b35]" />
          </div>
          <div>
            <div className="flex items-center gap-0.5">
              <button
                onClick={() => setDayOffset(o => o - 1)}
                className="p-0.5 hover:bg-[#30363d] rounded transition-colors text-[#8b949e] hover:text-white"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <h2 className="text-sm font-semibold text-white leading-tight px-0.5">{getDayLabel(dayOffset)}</h2>
              <button
                onClick={() => setDayOffset(o => o + 1)}
                className="p-0.5 hover:bg-[#30363d] rounded transition-colors text-[#8b949e] hover:text-white"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
            <p className="text-[10px] text-[#8b949e]">{getDateSubtitle(dayOffset)}</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {!noCalendar && !loading && (
            <span className="text-[10px] text-[#8b949e]">{events.length} event{events.length !== 1 ? 's' : ''}</span>
          )}
          <button onClick={fetchEvents} disabled={loading} className="p-1 hover:bg-[#30363d] rounded transition-colors disabled:opacity-50">
            <RefreshCw className={`w-3.5 h-3.5 text-[#8b949e] ${loading ? 'animate-spin' : ''}`} />
          </button>
          {!noCalendar && (
            <button
              onClick={handleRemove}
              disabled={removing}
              title="Remove calendar"
              className="p-1 hover:bg-[#30363d] rounded transition-colors disabled:opacity-50 text-[#8b949e] hover:text-[#ef4444]"
            >
              <Trash2 className={`w-3.5 h-3.5 ${removing ? 'animate-pulse' : ''}`} />
            </button>
          )}
        </div>
      </div>

      {/* "Just connected" banner */}
      {justConnected && !noCalendar && (
        <div className="flex-shrink-0 flex items-center gap-2 px-4 py-2 bg-[#ff6b35]/10 border-b border-[#ff6b35]/20">
          <RefreshCw className="w-3 h-3 text-[#ff6b35] flex-shrink-0" />
          <p className="text-[10px] text-[#ff6b35]">Calendar connected — it may take a moment to display your events.</p>
          <button onClick={() => setJustConnected(false)} className="ml-auto text-[#ff6b35]/60 hover:text-[#ff6b35] transition-colors">
            <X className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* No-calendar empty state */}
      {!loading && noCalendar ? (
        <div className="flex-1 flex flex-col items-center justify-center px-5 py-6 text-center gap-4">
          <div className="p-3 bg-[#ff6b35]/10 rounded-full">
            <Calendar className="w-6 h-6 text-[#ff6b35]" />
          </div>
          <div className="space-y-1">
            <h3 className="text-sm font-semibold text-white">No Calendar Connected</h3>
            <p className="text-[10px] text-[#8b949e] leading-relaxed max-w-[220px]">
              Connect your Google Calendar to see today&apos;s events here.
            </p>
          </div>
          <button
            onClick={() => { setSetupStep(0); setShowSetupModal(true); }}
            className="flex items-center gap-1.5 bg-[#ff6b35] hover:bg-[#ff6b35]/90 text-white text-xs font-medium rounded-lg px-4 py-2 transition-colors"
          >
            <Link className="w-3.5 h-3.5" />
            Connect Calendar
          </button>
        </div>
      ) : (
        <>
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
              <div className="flex flex-col items-center justify-center h-32 text-[#8b949e] gap-2">
                <div className="flex items-center gap-2 text-xs">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin text-[#ff6b35]" /> Loading...
                </div>
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

                {/* Current time indicator — only on today */}
                {dayOffset === 0 && (
                  <div className="absolute w-full flex items-center pointer-events-none z-20" style={{ top: nowTop }}>
                    <div className="w-12 flex justify-end pr-1.5 flex-shrink-0">
                      <div className="w-2 h-2 rounded-full bg-[#ef4444]" />
                    </div>
                    <div className="flex-1 border-t-2 border-[#ef4444]" />
                  </div>
                )}

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
                    <p className="text-xs text-[#8b949e]">Nothing scheduled {dayOffset === 0 ? 'today' : 'this day'}</p>
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
        </>
      )}

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
              <div className="flex items-center gap-2 text-xs text-[#8b949e]">
                <Clock className="w-3.5 h-3.5 flex-shrink-0" />
                <span>{selected.allDay ? 'All day' : `${fmtTime(selected.start)} – ${fmtTime(selected.end)}`}</span>
              </div>
              {selected.location && (
                <div className="flex items-start gap-2 text-xs text-[#8b949e]">
                  <MapPin className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                  <span>{selected.location}</span>
                </div>
              )}
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

      {/* Setup modal (carousel) */}
      {showSetupModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => setShowSetupModal(false)}
        >
          <div
            className="bg-[#161b22] border border-[#30363d] rounded-xl shadow-2xl w-full max-w-xl flex flex-col"
            style={{ maxHeight: '90vh' }}
            onClick={e => e.stopPropagation()}
          >
            {/* Modal header */}
            <div className="flex items-center justify-between px-6 pt-6 pb-5 border-b border-[#30363d]">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-[#ff6b35]/10 rounded-lg">
                  <Calendar className="w-5 h-5 text-[#ff6b35]" />
                </div>
                <span className="text-base font-semibold text-white">Connect Google Calendar</span>
              </div>
              <button onClick={() => setShowSetupModal(false)} className="p-1.5 hover:bg-[#30363d] rounded-lg transition-colors">
                <X className="w-5 h-5 text-[#8b949e]" />
              </button>
            </div>

            {/* Slide content */}
            <div className="px-8 py-8 flex-1 overflow-y-auto min-h-[320px] flex flex-col justify-center">
              {setupStep < SETUP_STEPS.length ? (
                // Instruction step
                <div className="flex flex-col items-center text-center gap-6">
                  {(() => {
                    const StepIcon = SETUP_STEPS[setupStep].icon;
                    return (
                      <div className="p-5 bg-[#ff6b35]/10 rounded-full">
                        <StepIcon className="w-10 h-10 text-[#ff6b35]" />
                      </div>
                    );
                  })()}
                  <div className="space-y-3 max-w-md">
                    <p className="text-xs font-semibold text-[#ff6b35] uppercase tracking-wider">
                      Step {setupStep + 1} of {totalSteps}
                    </p>
                    <h3 className="text-lg font-semibold text-white">{SETUP_STEPS[setupStep].title}</h3>
                    <p className="text-sm text-[#8b949e] leading-relaxed">
                      {SETUP_STEPS[setupStep].description}
                    </p>
                  </div>
                </div>
              ) : (
                // Connect step
                <div className="flex flex-col gap-4 max-w-md mx-auto w-full">
                  <div className="flex flex-col items-center text-center gap-3 mb-2">
                    <div className="p-5 bg-[#ff6b35]/10 rounded-full">
                      <Link className="w-10 h-10 text-[#ff6b35]" />
                    </div>
                    <p className="text-xs font-semibold text-[#ff6b35] uppercase tracking-wider">
                      Step {totalSteps} of {totalSteps}
                    </p>
                    <h3 className="text-lg font-semibold text-white">Paste Your iCal URL</h3>
                    <p className="text-sm text-[#8b949e]">
                      The URL must end in <span className="text-white font-mono">.ics</span> — not a sharing link.
                    </p>
                  </div>
                  <input
                    type="url"
                    value={icalInput}
                    onChange={e => setIcalInput(e.target.value)}
                    placeholder="https://calendar.google.com/calendar/ical/.../basic.ics"
                    className="w-full bg-[#0d1117] border border-[#30363d] rounded-lg px-4 py-3 text-sm text-white placeholder-[#8b949e] focus:outline-none focus:border-[#ff6b35] transition-colors"
                    onKeyDown={e => { if (e.key === 'Enter') handleConnect(); }}
                    autoFocus
                  />
                  {saveError && <p className="text-sm text-[#ef4444]">{saveError}</p>}
                  <button
                    onClick={handleConnect}
                    disabled={saving || !icalInput.trim()}
                    className="w-full flex items-center justify-center gap-2 bg-[#ff6b35] hover:bg-[#ff6b35]/90 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg px-4 py-3 transition-colors"
                  >
                    {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Link className="w-4 h-4" />}
                    {saving ? 'Connecting...' : 'Connect Calendar'}
                  </button>
                  <p className="text-xs text-[#8b949e] text-center">
                    Calendar may take a moment to display after connecting.
                  </p>
                  <a
                    href="https://support.google.com/calendar/answer/37648"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-[#8b949e] hover:text-[#ff6b35] transition-colors text-center underline underline-offset-2"
                  >
                    Need help? View Google&apos;s iCal setup guide
                  </a>
                </div>
              )}
            </div>

            {/* Step dots + navigation */}
            <div className="px-6 pb-6 pt-4 border-t border-[#30363d] flex items-center justify-between gap-3">
              <button
                onClick={() => setSetupStep(s => Math.max(0, s - 1))}
                disabled={setupStep === 0}
                className="flex items-center gap-1.5 px-3 py-2 hover:bg-[#30363d] rounded-lg transition-colors disabled:opacity-30 text-[#8b949e] text-sm"
              >
                <ChevronLeft className="w-4 h-4" /> Back
              </button>

              {/* Dots */}
              <div className="flex items-center gap-2 flex-1 justify-center">
                {Array.from({ length: totalSteps }, (_, i) => (
                  <button
                    key={i}
                    onClick={() => setSetupStep(i)}
                    className={`rounded-full transition-all ${
                      i === setupStep
                        ? 'w-6 h-2 bg-[#ff6b35]'
                        : 'w-2 h-2 bg-[#30363d] hover:bg-[#8b949e]'
                    }`}
                  />
                ))}
              </div>

              <button
                onClick={() => setSetupStep(s => Math.min(totalSteps - 1, s + 1))}
                disabled={setupStep === totalSteps - 1}
                className="flex items-center gap-1.5 px-3 py-2 hover:bg-[#30363d] rounded-lg transition-colors disabled:opacity-30 text-[#8b949e] text-sm"
              >
                Next <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
