'use client';

import { useState, useEffect } from 'react';

export default function LiveClock() {
  const [hhmm, setHhmm] = useState('');
  const [seconds, setSeconds] = useState('');
  const [ampm, setAmpm] = useState('');
  const [date, setDate] = useState('');

  useEffect(() => {
    const updateClock = () => {
      const now = new Date();

      const parts = now.toLocaleTimeString('en-US', {
        timeZone: 'America/New_York',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true,
      }).split(':');

      setHhmm(`${parts[0]}:${parts[1]}`);
      setSeconds(parts[2].slice(0, 2));
      setAmpm(parts[2].slice(3));

      setDate(now.toLocaleDateString('en-US', {
        timeZone: 'America/New_York',
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      }));
    };

    updateClock();
    const interval = setInterval(updateClock, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="text-right">
      <div className="flex items-baseline justify-end">
        <span className="text-sm font-mono tabular-nums text-[#e6edf3]">
          {hhmm || '--:--'}
        </span>
        <span className="text-xs font-mono tabular-nums text-[#ff6b35]">
          :{seconds || '--'}
        </span>
        <span className="text-[10px] text-[#8b949e] ml-1">
          {ampm || 'AM'}
        </span>
      </div>
      <div className="text-[10px] text-[#484f58] tracking-wide">
        {date || '---'} · EST
      </div>
    </div>
  );
}
