'use client';

import { useState, useEffect } from 'react';
import { Calendar, Clock, MapPin, ExternalLink, RefreshCw } from 'lucide-react';

interface CalendarEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  calendar: string;
  color: string;
  description?: string;
  location?: string;
}

export default function CalendarCard() {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchEvents();
    // Refresh every 5 minutes
    const interval = setInterval(fetchEvents, 300000);
    return () => clearInterval(interval);
  }, []);

  const fetchEvents = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/calendar-events');
      const data = await response.json();
      
      if (data.success) {
        setEvents(data.data);
      } else {
        setError(data.error || 'Failed to fetch events');
      }
      setLastUpdated(new Date());
    } catch {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  };

  const formatLastUpdated = () => {
    if (!lastUpdated) return '';
    const now = new Date();
    const diff = Math.floor((now.getTime() - lastUpdated.getTime()) / 1000);
    if (diff < 5) return 'just now';
    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    return `${Math.floor(diff / 3600)}h ago`;
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString('en-US', {
      timeZone: 'America/New_York',
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getRelativeTime = (dateString: string) => {
    const eventDate = new Date(dateString);
    const now = new Date();
    const diffMs = eventDate.getTime() - now.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    
    if (diffHours < 0) return 'Now';
    if (diffHours < 1) return 'Soon';
    if (diffHours < 24) return `in ${diffHours}h`;
    if (diffDays === 1) return 'Tomorrow';
    return `in ${diffDays}d`;
  };

  return (
    <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-[#ff6b35]/10 rounded-lg">
            <Calendar className="w-5 h-5 text-[#ff6b35]" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-white">Upcoming Events</h2>
            <div className="flex items-center gap-2">
              <p className="text-xs text-[#8b949e]">
                {events.length} event{events.length !== 1 ? 's' : ''} this week
              </p>
              {lastUpdated && !loading && (
                <span className="text-[10px] text-[#238636]">
                  updated {formatLastUpdated()}
                </span>
              )}
            </div>
          </div>
        </div>
        
        <button
          onClick={fetchEvents}
          disabled={loading}
          className="p-2 hover:bg-[#30363d] rounded-lg transition-colors disabled:opacity-50"
          title="Refresh events"
        >
          <RefreshCw className={`w-5 h-5 text-[#8b949e] hover:text-[#ff6b35] ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div className="space-y-3 max-h-[400px] overflow-y-auto">
        {loading && events.length === 0 ? (
          <div className="text-center py-8 text-[#8b949e]">
            <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-2 text-[#ff6b35]" />
            Loading events...
          </div>
        ) : error ? (
          <div className="text-center py-6">
            <p className="text-[#8b949e] text-sm">{error}</p>
            <button
              onClick={fetchEvents}
              className="mt-2 text-xs text-[#ff6b35] hover:underline"
            >
              Try again
            </button>
          </div>
        ) : events.length === 0 ? (
          <div className="text-center py-8 text-[#8b949e]">
            <Calendar className="w-12 h-12 mx-auto mb-2 opacity-50" />
            <p>No upcoming events</p>
            <p className="text-xs mt-1">Events will appear here when your calendar is connected</p>
          </div>
        ) : (
          events.map((event) => (
            <div
              key={event.id}
              className="p-3 bg-[#0d1117] rounded-lg border border-[#30363d] hover:border-[#ff6b35]/50 transition-colors"
            >
              <div className="flex items-start gap-3">
                {/* Color indicator */}
                <div 
                  className="w-1 h-full min-h-[40px] rounded-full flex-shrink-0"
                  style={{ backgroundColor: event.color }}
                />
                
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-medium text-white text-sm truncate">
                      {event.title}
                    </h3>
                    <span className="text-[10px] px-1.5 py-0.5 bg-[#30363d] text-[#8b949e] rounded-full flex-shrink-0">
                      {getRelativeTime(event.start)}
                    </span>
                  </div>
                  
                  <div className="flex items-center gap-1 text-xs text-[#8b949e] mt-1">
                    <Clock className="w-3 h-3" />
                    {formatTime(event.start)}
                  </div>
                  
                  {event.location && (
                    <div className="flex items-center gap-1 text-xs text-[#8b949e] mt-1">
                      <MapPin className="w-3 h-3" />
                      <span className="truncate">{event.location}</span>
                    </div>
                  )}
                  
                  {event.description && (
                    <p className="text-xs text-[#8b949e] mt-2 line-clamp-2">
                      {event.description}
                    </p>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
      
      {/* Link to Google Calendar */}
      <div className="mt-4 pt-4 border-t border-[#30363d]">
        <a
          href="https://calendar.google.com"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 text-xs text-[#8b949e] hover:text-[#ff6b35] transition-colors"
        >
          <ExternalLink className="w-3 h-3" />
          Open Google Calendar
        </a>
      </div>
    </div>
  );
}
