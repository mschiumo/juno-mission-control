'use client';

import { useState, useEffect } from 'react';
import { Globe } from 'lucide-react';

interface MarketStatus {
  name: string;
  isOpen: boolean;
  hours: string;
}

// Get market status based on current EST time
function getMarketStatus(): MarketStatus[] {
  const now = new Date();
  // Convert to EST (UTC-5)
  const estHour = (now.getUTCHours() - 5 + 24) % 24;
  const estMinute = now.getUTCMinutes();
  const estTime = estHour + estMinute / 60;
  const day = now.getUTCDay(); // 0 = Sunday, 1 = Monday, etc.

  const isWeekday = day >= 1 && day <= 5;

  // Asia: 7 PM - 2 AM EST (Sunday evening - Friday)
  const isAsiaOpen = isWeekday || (day === 0 && estTime >= 19);
  
  // London: 3 AM - 11:30 AM EST (Monday - Friday)
  const isLondonOpen = isWeekday && estTime >= 3 && estTime < 11.5;
  
  // New York: 9:30 AM - 4 PM EST (Monday - Friday)
  const isNYOpen = isWeekday && estTime >= 9.5 && estTime < 16;

  return [
    { name: 'Asia', isOpen: isAsiaOpen, hours: '7 PM - 2 AM EST' },
    { name: 'London', isOpen: isLondonOpen, hours: '3 AM - 11:30 AM EST' },
    { name: 'New York', isOpen: isNYOpen, hours: '9:30 AM - 4 PM EST' }
  ];
}

export default function MarketHoursBanner({ compact = false }: { compact?: boolean }) {
  const [marketStatus, setMarketStatus] = useState<MarketStatus[]>(getMarketStatus());

  useEffect(() => {
    // Update market status every minute
    const interval = setInterval(() => {
      setMarketStatus(getMarketStatus());
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  // Compact version for sidebar
  if (compact) {
    return (
      <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-3">
        <div className="flex items-center gap-2 mb-2">
          <Globe className="w-4 h-4 text-[#ff6b35]" />
          <span className="text-sm font-semibold text-white">Markets</span>
        </div>
        <div className="space-y-1.5">
          {marketStatus.map((market) => (
            <div key={market.name} className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-1.5">
                <div className={`w-2 h-2 rounded-full ${market.isOpen ? 'bg-[#238636] animate-pulse' : 'bg-[#da3633]'}`} />
                <span className="text-white">{market.name}</span>
              </div>
              <span className="text-[#8b949e]">{market.hours}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Full-width version (horizontal layout)
  return (
    <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-4">
      <div className="flex items-center gap-2 mb-3">
        <Globe className="w-5 h-5 text-[#ff6b35]" />
        <span className="font-semibold text-white">Market Hours</span>
      </div>
      <div className="grid grid-cols-3 gap-4">
        {marketStatus.map((market) => (
          <div key={market.name} className="text-center">
            <div className="flex items-center justify-center gap-2 mb-1">
              <div className={`w-2.5 h-2.5 rounded-full ${market.isOpen ? 'bg-[#238636] animate-pulse' : 'bg-[#da3633]'}`} />
              <span className="text-sm font-medium text-white">{market.name}</span>
            </div>
            <span className="text-xs text-[#8b949e]">{market.hours}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
