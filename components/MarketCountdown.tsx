'use client';

import { useState, useEffect } from 'react';
import { Clock } from 'lucide-react';

export default function MarketCountdown() {
  const [timeUntilOpen, setTimeUntilOpen] = useState<string>('');
  const [isOpen, setIsOpen] = useState<boolean>(false);

  useEffect(() => {
    const calculateTimeUntilOpen = () => {
      const now = new Date();
      const etNow = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
      
      // NYSE hours: 9:30 AM - 4:00 PM ET, Monday-Friday
      const currentHour = etNow.getHours();
      const currentMinute = etNow.getMinutes();
      const currentDay = etNow.getDay(); // 0 = Sunday, 6 = Saturday
      
      // Market is closed on weekends
      if (currentDay === 0 || currentDay === 6) {
        setIsOpen(false);
        
        // Find next Monday 9:30 AM
        const daysUntilMonday = currentDay === 0 ? 1 : 2;
        const nextOpen = new Date(etNow);
        nextOpen.setDate(etNow.getDate() + daysUntilMonday);
        nextOpen.setHours(9, 30, 0, 0);
        
        const diffMs = nextOpen.getTime() - etNow.getTime();
        const diffHrs = Math.floor(diffMs / (1000 * 60 * 60));
        const diffMins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
        
        setTimeUntilOpen(`${diffHrs}h ${diffMins}m`);
        return;
      }
      
      // Check if market is currently open (9:30 - 16:00)
      const marketOpen = currentHour > 9 || (currentHour === 9 && currentMinute >= 30);
      const marketClose = currentHour < 16;
      
      if (marketOpen && marketClose) {
        setIsOpen(true);
        
        // Time until close
        const closeTime = new Date(etNow);
        closeTime.setHours(16, 0, 0, 0);
        const diffMs = closeTime.getTime() - etNow.getTime();
        const diffHrs = Math.floor(diffMs / (1000 * 60 * 60));
        const diffMins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
        
        setTimeUntilOpen(`${diffHrs}h ${diffMins}m until close`);
        return;
      }
      
      // Market is closed (before 9:30 or after 16:00)
      setIsOpen(false);
      
      let nextOpen: Date;
      
      if (currentHour < 9 || (currentHour === 9 && currentMinute < 30)) {
        // Same day, before open
        nextOpen = new Date(etNow);
        nextOpen.setHours(9, 30, 0, 0);
      } else {
        // After close, next day
        if (currentDay === 5) {
          // Friday after hours, next open is Monday
          nextOpen = new Date(etNow);
          nextOpen.setDate(etNow.getDate() + 3);
        } else {
          // Next day
          nextOpen = new Date(etNow);
          nextOpen.setDate(etNow.getDate() + 1);
        }
        nextOpen.setHours(9, 30, 0, 0);
      }
      
      const diffMs = nextOpen.getTime() - etNow.getTime();
      const diffHrs = Math.floor(diffMs / (1000 * 60 * 60));
      const diffMins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
      
      setTimeUntilOpen(`${diffHrs}h ${diffMins}m`);
    };

    calculateTimeUntilOpen();
    const interval = setInterval(calculateTimeUntilOpen, 60000); // Update every minute
    
    return () => clearInterval(interval);
  }, []);

  return (
    <div className={`inline-flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium ${
      isOpen 
        ? 'bg-[#238636]/20 text-[#238636]' 
        : 'bg-[#d29922]/20 text-[#d29922]'
    }`}>
      <Clock className="w-3 h-3" />
      <span>
        {isOpen ? (
          <span>OPEN · {timeUntilOpen}</span>
        ) : (
          <span>{timeUntilOpen} until open</span>
        )}
      </span>
    </div>
  );
}
