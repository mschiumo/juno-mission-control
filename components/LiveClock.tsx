'use client';

import { useState, useEffect } from 'react';

export default function LiveClock() {
  const [time, setTime] = useState('');
  const [date, setDate] = useState('');

  useEffect(() => {
    const updateClock = () => {
      const now = new Date();
      
      const timeOptions: Intl.DateTimeFormatOptions = {
        timeZone: 'America/New_York',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true
      };

      const dateOptions: Intl.DateTimeFormatOptions = {
        timeZone: 'America/New_York',
        weekday: 'short',
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      };

      setTime(now.toLocaleTimeString('en-US', timeOptions));
      setDate(now.toLocaleDateString('en-US', dateOptions));
    };

    // Initial update
    updateClock();

    // Update every second
    const interval = setInterval(updateClock, 1000);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="text-right">
      <div className="text-lg font-mono text-[#ff6b35]">
        {time || '--:--:--'}
      </div>
      <div className="text-xs text-[#8b949e]">
        {date || 'Loading...'} (EST)
      </div>
    </div>
  );
}