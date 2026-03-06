'use client';

import { useState, useEffect, useCallback } from 'react';
import { 
  Calendar, 
  Clock, 
  MapPin, 
  ExternalLink, 
  RefreshCw, 
  ChevronDown, 
  ChevronUp,
  Video,
  Users,
  AlertCircle,
  CheckCircle2,
  Link2,
  CheckCircle,
  XCircle,
  Loader2
} from 'lucide-react';

interface CalendarEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  duration: number;
  calendar: string;
  color: string;
  description?: string;
  location?: string;
  isAllDay: boolean;
  hangoutLink?: string;
  attendees?: string[];
}

interface CalendarData {
  events: CalendarEvent[];
  today: CalendarEvent[];
  upcoming: CalendarEvent[];
}

interface AuthStatus {
  authorized: boolean;
  loading: boolean;
  error?: string;
}

export default function CalendarCard() {
  const [data, setData] = useState<CalendarData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [isExpanded, setIsExpanded] = useState(true);
  const [isMockData, setIsMockData] = useState(false);
  const [authStatus, setAuthStatus] = useState<AuthStatus>({ authorized: false, loading: true });
  const [authInProgress, setAuthInProgress] = useState(false);
  const [authMessage, setAuthMessage] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const fetchEvents = useCallback(async (forceRefresh = false) => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch(`/api/calendar?${forceRefresh ? 'refresh=true' : ''}`);
      const result = await response.json();
      
      if (result.success) {
        setData(result.data);
        setIsMockData(result.mock || false);
        setLastUpdated(new Date());
      } else {
        setError(result.error || 'Failed to fetch events');
      }
    } catch (err) {
      setError('Network error - please try again');
      console.error('Calendar fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const checkAuthStatus = useCallback(async () => {
    try {
      setAuthStatus(prev => ({ ...prev, loading: true }));
      const response = await fetch('/api/auth/calendar/status');
      const result = await response.json();
      
      setAuthStatus({
        authorized: result.authorized || false,
        loading: false,
        error: result.error
      });
    } catch (err) {
      console.error('Auth status check error:', err);
      setAuthStatus({
        authorized: false,
        loading: false,
        error: 'Failed to check auth status'
      });
    }
  }, []);

  // Check for OAuth callback parameters
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const authResult = params.get('calendar_auth');
      
      if (authResult === 'success') {
        setAuthMessage({ type: 'success', message: 'Calendar connected successfully!' });
        // Remove the query parameter
        window.history.replaceState({}, '', window.location.pathname);
        // Refresh auth status and events
        checkAuthStatus();
        fetchEvents(true);
        // Clear message after 5 seconds
        setTimeout(() => setAuthMessage(null), 5000);
      } else if (authResult === 'error') {
        const errorMsg = params.get('error') || 'Authorization failed';
        setAuthMessage({ type: 'error', message: `Connection failed: ${errorMsg}` });
        window.history.replaceState({}, '', window.location.pathname);
        setTimeout(() => setAuthMessage(null), 5000);
      }
    }
  }, [checkAuthStatus, fetchEvents]);

  // Fetch on mount and set up auto-refresh every 15 minutes
  useEffect(() => {
    fetchEvents();
    checkAuthStatus();
    
    const interval = setInterval(() => {
      fetchEvents(false); // Use cache if available
    }, 15 * 60 * 1000); // 15 minutes
    
    return () => clearInterval(interval);
  }, [fetchEvents, checkAuthStatus]);

  const handleAuthorize = async () => {
    setAuthInProgress(true);
    try {
      // Open OAuth flow in the same window
      window.location.href = '/api/auth/calendar';
    } catch (err) {
      console.error('Auth initiation error:', err);
      setAuthInProgress(false);
      setAuthMessage({ type: 'error', message: 'Failed to start authorization' });
    }
  };

  const formatTime = (dateString: string, isAllDay: boolean) => {
    if (isAllDay) return 'All day';
    
    const date = new Date(dateString);
    return date.toLocaleString('en-US', {
      timeZone: 'America/New_York',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  };

  const formatDuration = (minutes: number) => {
    if (minutes >= 60) {
      const hours = Math.floor(minutes / 60);
      const mins = minutes % 60;
      return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
    }
    return `${minutes}m`;
  };

  const formatLastUpdated = () => {
    if (!lastUpdated) return '';
    const now = new Date();
    const diff = Math.floor((now.getTime() - lastUpdated.getTime()) / 1000);
    
    if (diff < 60) return 'just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  };

  const getRelativeTime = (dateString: string) => {
    const eventDate = new Date(dateString);
    const now = new Date();
    const diffMs = eventDate.getTime() - now.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    
    if (diffHours < 0) return 'In progress';
    if (diffHours < 1) return 'Soon';
    if (diffHours < 24) return `in ${diffHours}h`;
    if (diffDays === 1) return 'Tomorrow';
    if (diffDays < 7) {
      const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      return days[eventDate.getDay()];
    }
    return `${diffDays}d`;
  };

  const getEventTimeRange = (event: CalendarEvent) => {
    if (event.isAllDay) return 'All day';
    
    const start = new Date(event.start);
    const end = new Date(event.end);
    
    const startTime = start.toLocaleString('en-US', {
      timeZone: 'America/New_York',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
    
    const endTime = end.toLocaleString('en-US', {
      timeZone: 'America/New_York',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
    
    return `${startTime} - ${endTime}`;
  };

  const openGoogleCalendar = () => {
    window.open('https://calendar.google.com', '_blank', 'noopener,noreferrer');
  };

  const openEvent = (event: CalendarEvent) => {
    if (event.hangoutLink) {
      window.open(event.hangoutLink, '_blank', 'noopener,noreferrer');
    } else {
      openGoogleCalendar();
    }
  };

  const renderEvent = (event: CalendarEvent, isToday: boolean) => (
    <div
      key={event.id}
      onClick={() => openEvent(event)}
      className="group p-3 bg-[#0F0F0F] rounded-xl border border-[#262626] hover:border-[#F97316]/50 transition-all cursor-pointer"
    >
      <div className="flex items-start gap-3">
        {/* Color indicator */}
        <div 
          className="w-1 h-full min-h-[40px] rounded-full flex-shrink-0"
          style={{ backgroundColor: event.color }}
        />
        
        <div className="flex-1 min-w-0">
          {/* Title row */}
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-medium text-white text-sm truncate group-hover:text-[#F97316] transition-colors">
              {event.title}
            </h3>
            <span className="text-[10px] px-1.5 py-0.5 bg-[#262626] text-[#737373] rounded-full flex-shrink-0">
              {isToday ? getRelativeTime(event.start) : getRelativeTime(event.start)}
            </span>
          </div>
          
          {/* Time row */}
          <div className="flex items-center gap-3 mt-1.5 flex-wrap">
            <div className="flex items-center gap-1 text-xs text-[#737373]">
              <Clock className="w-3 h-3" />
              <span>{getEventTimeRange(event)}</span>
              {!event.isAllDay && (
                <span className="text-[#525252]">({formatDuration(event.duration)})</span>
              )}
            </div>
          </div>
          
          {/* Location */}
          {event.location && (
            <div className="flex items-center gap-1 text-xs text-[#737373] mt-1">
              <MapPin className="w-3 h-3" />
              <span className="truncate">{event.location}</span>
            </div>
          )}
          
          {/* Video link indicator */}
          {event.hangoutLink && (
            <div className="flex items-center gap-1 text-xs text-[#58a6ff] mt-1">
              <Video className="w-3 h-3" />
              <span>Google Meet</span>
            </div>
          )}
          
          {/* Attendees count */}
          {event.attendees && event.attendees.length > 0 && (
            <div className="flex items-center gap-1 text-xs text-[#737373] mt-1">
              <Users className="w-3 h-3" />
              <span>{event.attendees.length} attendee{event.attendees.length !== 1 ? 's' : ''}</span>
            </div>
          )}
          
          {/* Description preview */}
          {event.description && (
            <p className="text-xs text-[#525252] mt-2 line-clamp-2">
              {event.description}
            </p>
          )}
        </div>
      </div>
    </div>
  );

  const todayCount = data?.today?.length || 0;
  const upcomingCount = data?.upcoming?.length || 0;
  const showAuthorizeButton = !authStatus.loading && !authStatus.authorized;

  return (
    <div className="card">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-[#F97316]/10 rounded-xl">
            <Calendar className="w-5 h-5 text-[#F97316]" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-white">Calendar</h2>
            <div className="flex items-center gap-2">
              <p className="text-xs text-[#737373]">
                {todayCount > 0 ? `${todayCount} today` : 'No events today'}
                {upcomingCount > 0 && ` • ${upcomingCount} upcoming`}
              </p>
              {lastUpdated && !loading && (
                <span className="text-[10px] text-[#22c55e]">
                  updated {formatLastUpdated()}
                </span>
              )}
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          {isMockData && (
            <div className="flex items-center gap-1 text-[10px] text-[#d29922] px-2 py-1 bg-[#d29922]/10 rounded-full"
              title="Using demo data - connect Google Calendar to see your real events"
            >
              <AlertCircle className="w-3 h-3" />
              <span className="hidden sm:inline">Demo</span>
            </div>
          )}
          
          {!authStatus.loading && authStatus.authorized && (
            <div className="flex items-center gap-1 text-[10px] text-[#22c55e] px-2 py-1 bg-[#22c55e]/10 rounded-full"
              title="Connected to Google Calendar"
            >
              <CheckCircle className="w-3 h-3" />
              <span className="hidden sm:inline">Connected</span>
            </div>
          )}
          
          <button
            onClick={() => fetchEvents(true)}
            disabled={loading}
            className="p-2 hover:bg-[#262626] rounded-xl transition-colors disabled:opacity-50"
            title="Refresh events"
          >
            <RefreshCw className={`w-5 h-5 text-[#737373] hover:text-[#F97316] ${loading ? 'animate-spin' : ''}`} />
          </button>
          
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-2 hover:bg-[#262626] rounded-xl transition-colors"
            title={isExpanded ? 'Collapse' : 'Expand'}
          >
            {isExpanded ? (
              <ChevronUp className="w-5 h-5 text-[#737373] hover:text-[#F97316]" />
            ) : (
              <ChevronDown className="w-5 h-5 text-[#737373] hover:text-[#F97316]" />
            )}
          </button>
        </div>
      </div>

      {/* Auth message */}
      {authMessage && (
        <div className={`mb-4 p-3 rounded-xl border ${
          authMessage.type === 'success' 
            ? 'bg-[#22c55e]/10 border-[#22c55e]/30' 
            : 'bg-[#da3633]/10 border-[#da3633]/30'
        }`}>
          <div className="flex items-center gap-2">
            {authMessage.type === 'success' ? (
              <CheckCircle className="w-4 h-4 text-[#22c55e]" />
            ) : (
              <XCircle className="w-4 h-4 text-[#da3633]" />
            )}
            <span className={`text-sm ${authMessage.type === 'success' ? 'text-[#22c55e]' : 'text-[#da3633]'}`}>
              {authMessage.message}
            </span>
          </div>
        </div>
      )}

      {/* Authorization prompt */}
      {showAuthorizeButton && isExpanded && (
        <div className="mb-4 p-4 bg-[#F97316]/5 border border-[#F97316]/20 rounded-xl">
          <div className="flex items-start gap-3">
            <div className="p-2 bg-[#F97316]/10 rounded-lg">
              <Link2 className="w-5 h-5 text-[#F97316]" />
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-medium text-white mb-1">Connect Google Calendar</h3>
              <p className="text-xs text-[#737373] mb-3">
                Currently showing demo events. Connect your Google Calendar to see your real schedule and get personalized event notifications.
              </p>
              <button
                onClick={handleAuthorize}
                disabled={authInProgress}
                className="flex items-center gap-2 px-4 py-2 bg-[#F97316] hover:bg-[#F97316]/90 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {authInProgress ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Connecting...
                  </>
                ) : (
                  <>
                    <Calendar className="w-4 h-4" />
                    Connect Google Calendar
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="mb-4 p-3 bg-[#da3633]/10 border border-[#da3633]/30 rounded-xl">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-[#da3633]" />
            <span className="text-sm text-[#da3633]">{error}</span>
          </div>
        </div>
      )}

      {/* Collapsible content */}
      {isExpanded && (
        <>
          {/* Today's Events Section */}
          <div className="mb-4">
            <h3 className="text-xs font-semibold text-[#737373] uppercase tracking-wider mb-3 flex items-center gap-2">
              <CheckCircle2 className="w-3 h-3" />
              Today
            </h3>
            
            {loading && !data ? (
              <div className="text-center py-6 text-[#737373]">
                <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-[#F97316]" />
                <p className="text-sm">Loading events...</p>
              </div>
            ) : todayCount === 0 ? (
              <div className="text-center py-6 bg-[#0F0F0F] rounded-xl border border-[#262626]">
                <Calendar className="w-8 h-8 mx-auto mb-2 text-[#525252]" />
                <p className="text-sm text-[#737373]">No events today</p>
                <p className="text-xs text-[#525252] mt-1">Enjoy your free time!</p>
              </div>
            ) : (
              <div className="space-y-2">
                {data?.today.map(event => renderEvent(event, true))}
              </div>
            )}
          </div>

          {/* Upcoming Events Section */}
          {upcomingCount > 0 && (
            <div className="mb-4">
              <h3 className="text-xs font-semibold text-[#737373] uppercase tracking-wider mb-3 flex items-center gap-2">
                <Clock className="w-3 h-3" />
                Upcoming
              </h3>
              
              <div className="space-y-2 max-h-[200px] overflow-y-auto pr-1">
                {data?.upcoming.slice(0, 5).map(event => renderEvent(event, false))}
              </div>
              
              {upcomingCount > 5 && (
                <p className="text-xs text-[#525252] text-center mt-2">
                  +{upcomingCount - 5} more events
                </p>
              )}
            </div>
          )}
        </>
      )}
      
      {/* Footer - Link to Google Calendar */}
      <div className="pt-4 border-t border-[#262626]">
        <button
          onClick={openGoogleCalendar}
          className="flex items-center justify-center gap-2 w-full text-xs text-[#737373] hover:text-[#F97316] transition-colors py-2"
        >
          <ExternalLink className="w-3 h-3" />
          Open Google Calendar
        </button>
      </div>
    </div>
  );
}
