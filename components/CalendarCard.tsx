'use client';

import { useState, useEffect } from 'react';
import { Calendar, Plus, Clock, MapPin } from 'lucide-react';

interface CalendarEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  calendar: string;
  color: string;
  description?: string;
}

export default function CalendarCard() {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newEvent, setNewEvent] = useState({
    title: '',
    description: '',
    startDate: '',
    endDate: ''
  });

  useEffect(() => {
    fetchEvents();
    // Refresh every 60 seconds
    const interval = setInterval(fetchEvents, 60000);
    return () => clearInterval(interval);
  }, []);

  const fetchEvents = async () => {
    try {
      const response = await fetch('/api/calendar-events');
      const data = await response.json();
      if (data.success) {
        setEvents(data.data);
      }
    } catch (error) {
      console.error('Failed to fetch events:', error);
    } finally {
      setLoading(false);
    }
  };

  const createEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const response = await fetch('/api/create-event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newEvent)
      });
      const data = await response.json();
      if (data.success) {
        setShowAddModal(false);
        setNewEvent({ title: '', description: '', startDate: '', endDate: '' });
        fetchEvents();
      }
    } catch (error) {
      console.error('Failed to create event:', error);
    }
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString('en-US', { 
      timeZone: 'America/New_York',
      hour: '2-digit', 
      minute: '2-digit',
      hour12: true
    });
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const options: Intl.DateTimeFormatOptions = {
      timeZone: 'America/New_York',
      weekday: 'short',
      month: 'short',
      day: 'numeric'
    };

    const dateInEST = new Date(date.toLocaleString('en-US', { timeZone: 'America/New_York' }));
    const todayInEST = new Date(today.toLocaleString('en-US', { timeZone: 'America/New_York' }));
    const tomorrowInEST = new Date(tomorrow.toLocaleString('en-US', { timeZone: 'America/New_York' }));

    if (dateInEST.toDateString() === todayInEST.toDateString()) return 'Today';
    if (dateInEST.toDateString() === tomorrowInEST.toDateString()) return 'Tomorrow';
    return date.toLocaleDateString('en-US', options);
  };

  // Group events by date
  const groupedEvents = events.reduce((acc, event) => {
    const date = new Date(event.start).toDateString();
    if (!acc[date]) acc[date] = [];
    acc[date].push(event);
    return acc;
  }, {} as Record<string, CalendarEvent[]>);

  return (
    <>
      <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-[#ff6b35]/10 rounded-lg">
              <Calendar className="w-5 h-5 text-[#ff6b35]" />
            </div>
            <h2 className="text-lg font-semibold text-white">Calendar</h2>
          </div>
          <button
            onClick={() => setShowAddModal(true)}
            className="p-2 bg-[#ff6b35] hover:bg-[#ff8c5a] text-white rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-4 max-h-96 overflow-y-auto">
          {loading ? (
            <div className="text-center py-4 text-[#8b949e]">Loading...</div>
          ) : Object.entries(groupedEvents).length === 0 ? (
            <div className="text-center py-4 text-[#8b949e]">No upcoming events</div>
          ) : (
            Object.entries(groupedEvents).map(([date, dateEvents]) => (
              <div key={date}>
                <div className="text-xs font-medium text-[#ff6b35] uppercase tracking-wider mb-2">
                  {formatDate(dateEvents[0].start)}
                </div>
                <div className="space-y-2">
                  {dateEvents.map((event) => (
                    <div 
                      key={event.id}
                      className="flex items-start gap-3 p-3 bg-[#0d1117] rounded-lg border border-[#30363d] hover:border-[#ff6b35]/50 transition-colors"
                    >
                      <div 
                        className="w-1 h-full min-h-[40px] rounded-full"
                        style={{ backgroundColor: event.color }}
                      />
                      <div className="flex-1">
                        <div className="font-medium text-white">{event.title}</div>
                        <div className="flex items-center gap-2 text-xs text-[#8b949e] mt-1">
                          <Clock className="w-3 h-3" />
                          <span>{formatTime(event.start)} - {formatTime(event.end)}</span>
                        </div>
                        {event.description && (
                          <div className="text-xs text-[#8b949e] mt-1">{event.description}</div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Add Event Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold text-white mb-4">Add Event</h3>
            <form onSubmit={createEvent} className="space-y-4">
              <div>
                <label className="block text-sm text-[#8b949e] mb-1">Title</label>
                <input
                  type="text"
                  value={newEvent.title}
                  onChange={(e) => setNewEvent({ ...newEvent, title: e.target.value })}
                  className="w-full px-3 py-2 bg-[#0d1117] border border-[#30363d] rounded-lg text-white focus:outline-none focus:border-[#ff6b35]"
                  required
                />
              </div>
              <div>
                <label className="block text-sm text-[#8b949e] mb-1">Description</label>
                <input
                  type="text"
                  value={newEvent.description}
                  onChange={(e) => setNewEvent({ ...newEvent, description: e.target.value })}
                  className="w-full px-3 py-2 bg-[#0d1117] border border-[#30363d] rounded-lg text-white focus:outline-none focus:border-[#ff6b35]"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-[#8b949e] mb-1">Start</label>
                  <input
                    type="datetime-local"
                    value={newEvent.startDate}
                    onChange={(e) => setNewEvent({ ...newEvent, startDate: e.target.value })}
                    className="w-full px-3 py-2 bg-[#0d1117] border border-[#30363d] rounded-lg text-white focus:outline-none focus:border-[#ff6b35]"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm text-[#8b949e] mb-1">End</label>
                  <input
                    type="datetime-local"
                    value={newEvent.endDate}
                    onChange={(e) => setNewEvent({ ...newEvent, endDate: e.target.value })}
                    className="w-full px-3 py-2 bg-[#0d1117] border border-[#30363d] rounded-lg text-white focus:outline-none focus:border-[#ff6b35]"
                  />
                </div>
              </div>
              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="flex-1 px-4 py-2 bg-[#30363d] hover:bg-[#484f58] text-white rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-[#ff6b35] hover:bg-[#ff8c5a] text-white rounded-lg transition-colors"
                >
                  Create
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
