'use client';

import { useState, useEffect } from 'react';
import { Moon, X } from 'lucide-react';

export default function EveningCheckinReminder() {
  const [showReminder, setShowReminder] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkEveningCheckinStatus();
  }, []);

  const checkEveningCheckinStatus = async () => {
    try {
      const response = await fetch('/api/evening-checkin');
      const data = await response.json();
      
      if (data.success) {
        // Show reminder if no check-in for today OR if it's after 6 PM EST
        const now = new Date();
        const estHour = (now.getUTCHours() - 5 + 24) % 24;
        const isEvening = estHour >= 18; // 6 PM or later
        
        if (!data.data.todayCheckin && isEvening) {
          setShowReminder(true);
        }
      }
    } catch (error) {
      console.error('Failed to check evening checkin status:', error);
    } finally {
      setLoading(false);
    }
  };

  const dismissReminder = () => {
    setShowReminder(false);
    // Store dismissal in localStorage for today
    const today = new Date().toLocaleDateString('en-US', {
      timeZone: 'America/New_York',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
    localStorage.setItem('evening_checkin_dismissed', today);
  };

  // Check if already dismissed today
  useEffect(() => {
    const dismissed = localStorage.getItem('evening_checkin_dismissed');
    const today = new Date().toLocaleDateString('en-US', {
      timeZone: 'America/New_York',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
    
    if (dismissed === today) {
      setShowReminder(false);
    }
  }, []);

  if (loading || !showReminder) return null;

  return (
    <div className="bg-gradient-to-r from-[#a371f7]/20 to-[#ff6b35]/20 border border-[#a371f7]/50 rounded-lg p-4 mb-4">
      <div className="flex items-start gap-3">
        <div className="p-2 bg-[#a371f7]/20 rounded-lg">
          <Moon className="w-5 h-5 text-[#a371f7]" />
        </div>
        
        <div className="flex-1">
          <h3 className="font-semibold text-white">Evening Habit Check-in 🌙</h3>
          <p className="text-sm text-[#8b949e] mt-1">
            Don&#39;t forget to check in on today&#39;s habits! Click the notebook icon on the habits card.
          </p>
          
          <div className="flex items-center gap-3 mt-3">
            <button
              onClick={dismissReminder}
              className="text-sm text-[#8b949e] hover:text-white transition-colors"
            >
              Dismiss for today
            </button>
          </div>
        </div>
        
        <button
          onClick={dismissReminder}
          className="p-1 hover:bg-[#30363d] rounded-lg transition-colors"
        >
          <X className="w-4 h-4 text-[#8b949e]" />
        </button>
      </div>
    </div>
  );
}