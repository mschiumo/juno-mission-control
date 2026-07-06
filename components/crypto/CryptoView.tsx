'use client';

import { useSession } from 'next-auth/react';
import { isOwnerEmail } from '@/lib/owner';
import CryptoScreenerCard from './CryptoScreenerCard';
import CryptoAgentPanel from './CryptoAgentPanel';

/**
 * Crypto sub-tab: momentum screener for everyone; the trading agent console is
 * owner-only (it moves the owner's money, same policy as brokerage connect).
 */
export default function CryptoView() {
  const { data: session } = useSession();
  const isOwner = isOwnerEmail(session?.user?.email);

  return (
    <div className="space-y-5">
      {isOwner && <CryptoAgentPanel />}
      <CryptoScreenerCard />
    </div>
  );
}
