'use client';

import PositionCalculator from './PositionCalculator';

export default function TradeManagementView() {
  return (
    <div className="bg-[#161b22] border border-[#30363d] rounded-xl overflow-hidden p-6">
      <PositionCalculator />
    </div>
  );
}
