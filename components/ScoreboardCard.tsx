'use client';

import { ClipboardCheck } from 'lucide-react';
import WeeklyScoreboard from '@/components/WeeklyScoreboard';

// Standalone dashboard card for the weekly scoreboard. The same numbers also
// live in the Fitness card's Scoreboard tab; this card fills the bottom of the
// dashboard's right column so it lines up with the Habits card.
export default function ScoreboardCard() {
  return (
    <div className="bg-[#161b22] border border-[#30363d] rounded-xl overflow-hidden flex flex-col h-full">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-[#30363d] bg-[#0d1117]/50 flex-shrink-0">
        <ClipboardCheck className="w-4 h-4 text-[#F97316]" />
        <h2 className="text-sm font-semibold text-white">Weekly Scoreboard</h2>
      </div>
      <div className="flex-1 min-h-0">
        <WeeklyScoreboard variant="card" />
      </div>
    </div>
  );
}
