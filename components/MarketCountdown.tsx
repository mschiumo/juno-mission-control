'use client';

import { Clock } from 'lucide-react';
import useMarketStatus from '@/hooks/useMarketStatus';

export default function MarketCountdown() {
  const { isOpen, label } = useMarketStatus();

  return (
    <div className={`inline-flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium ${
      isOpen
        ? 'bg-[#238636]/20 text-[#238636]'
        : 'bg-[#d29922]/20 text-[#d29922]'
    }`}>
      <Clock className="w-3 h-3" />
      <span>{label}</span>
    </div>
  );
}
