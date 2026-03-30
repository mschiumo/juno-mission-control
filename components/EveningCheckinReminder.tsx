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
    <div className="bg-gradient-to-r from-[#a855f7]/[0.08] to-[#F97316]/[0.06] border border-[#a855f7]/15 rounded-2xl p-4 mb-1">
      <div className="flex items-start gap-3">
        <div className="p-2 bg-[#a855f7]/10 rounded-xl">
          <Moon className="w-5 h-5 text-[#a855f7]" />
        </div>
        
        <div className="flex-1">
          <h3 className="font-semibold text-white text-sm">Evening Habit Check-in</h3>
          <p className="text-sm text-[#a1a1aa] mt-1">
            Don&#39;t forget to check in on today&#39;s habits! Click the notebook icon on the habits card.
          </p>
          
          <div className="flex items-center gap-3 mt-3">
            <button
              onClick={dismissReminder}
              className="text-sm text-[#71717a] hover:text-white transition-colors duration-200"
            >
              Dismiss for today
            </button>
          </div>
        </div>
        
        <button
          onClick={dismissReminder}
          className="p-1 hover:bg-white/[0.06] rounded-lg transition-all duration-200"
        >
          <X className="w-4 h-4 text-[#52525b]" />
        </button>
      </div>
    </div>
  );
}