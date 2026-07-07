'use client';

/**
 * Small badge showing where an account's balance comes from: "sheet" for
 * Google Sheet sync, "live" for aggregator/brokerage connections. Manual
 * accounts get no badge.
 */

import { AccountSource } from '@/lib/finance/types';

export function SourceBadge({ source }: { source: AccountSource }) {
  if (source === 'manual') return null;
  const isSheet = source === 'gsheet';
  return (
    <span
      className="ml-2 px-1.5 py-0.5 rounded text-[10px] font-semibold align-middle"
      style={
        isSheet
          ? { background: 'rgba(0,200,150,0.12)', color: 'var(--positive)' }
          : { background: 'rgba(56,189,248,0.12)', color: '#38BDF8' }
      }
      title={isSheet ? 'Synced from Google Sheet' : `Live via ${source}`}
    >
      {isSheet ? 'sheet' : 'live'}
    </span>
  );
}
