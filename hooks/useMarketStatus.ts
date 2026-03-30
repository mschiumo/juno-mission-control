'use client';

import { useState, useEffect } from 'react';

interface MarketStatus {
  isOpen: boolean;
  label: string; // e.g. "OPEN · 3h 12m until close" or "1h 45m until open"
}

function getMarketStatus(): MarketStatus {
  const now = new Date();
  const etNow = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));

  const currentHour = etNow.getHours();
  const currentMinute = etNow.getMinutes();
  const currentDay = etNow.getDay(); // 0 = Sunday, 6 = Saturday

  // Weekends
  if (currentDay === 0 || currentDay === 6) {
    const daysUntilMonday = currentDay === 0 ? 1 : 2;
    const nextOpen = new Date(etNow);
    nextOpen.setDate(etNow.getDate() + daysUntilMonday);
    nextOpen.setHours(9, 30, 0, 0);

    const diffMs = nextOpen.getTime() - etNow.getTime();
    const diffHrs = Math.floor(diffMs / (1000 * 60 * 60));
    const diffMins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

    return { isOpen: false, label: `${diffHrs}h ${diffMins}m until open` };
  }

  // Check if market is currently open (9:30 - 16:00)
  const afterOpen = currentHour > 9 || (currentHour === 9 && currentMinute >= 30);
  const beforeClose = currentHour < 16;

  if (afterOpen && beforeClose) {
    const closeTime = new Date(etNow);
    closeTime.setHours(16, 0, 0, 0);
    const diffMs = closeTime.getTime() - etNow.getTime();
    const diffHrs = Math.floor(diffMs / (1000 * 60 * 60));
    const diffMins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

    return { isOpen: true, label: `OPEN · ${diffHrs}h ${diffMins}m until close` };
  }

  // Closed — before open or after close
  let nextOpen: Date;

  if (currentHour < 9 || (currentHour === 9 && currentMinute < 30)) {
    nextOpen = new Date(etNow);
    nextOpen.setHours(9, 30, 0, 0);
  } else {
    nextOpen = new Date(etNow);
    if (currentDay === 5) {
      // Friday after hours → Monday
      nextOpen.setDate(etNow.getDate() + 3);
    } else {
      nextOpen.setDate(etNow.getDate() + 1);
    }
    nextOpen.setHours(9, 30, 0, 0);
  }

  const diffMs = nextOpen.getTime() - etNow.getTime();
  const diffHrs = Math.floor(diffMs / (1000 * 60 * 60));
  const diffMins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

  return { isOpen: false, label: `${diffHrs}h ${diffMins}m until open` };
}

export default function useMarketStatus() {
  const [status, setStatus] = useState<MarketStatus>(getMarketStatus);

  useEffect(() => {
    const update = () => setStatus(getMarketStatus());
    const interval = setInterval(update, 60000);
    return () => clearInterval(interval);
  }, []);

  return status;
}
