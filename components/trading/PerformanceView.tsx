'use client';

/**
 * PerformanceView — shell for the Performance tab.
 *
 * Owns data loading and the period selector, then hands off to
 * DayTradingPerformance for the layout. The app supports a single synced
 * brokerage account, so there is no per-account switching here — the tab
 * always shows the one aggregate series the server derives.
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useEntitlements } from '@/lib/use-entitlements';
import { Loader2 } from 'lucide-react';
import DayTradingPerformance from '@/components/trading/DayTradingPerformance';
import {
  type Trade,
  type DailyBalance,
  type DailyFee,
  type Period,
  PERIOD_LABELS,
} from '@/components/trading/performance-shared';
import type { BrokerAccount } from '@/lib/db/broker-connections';

export default function PerformanceView({ refreshKey }: { refreshKey?: number }) {
  // AI Journal Insights is Gold+; below that the section simply isn't rendered.
  const { entitlements } = useEntitlements();
  const journalInsightsAllowed = entitlements.features.journalInsights;
  const [period, setPeriod] = useState<Period>('all');
  const [allTrades, setAllTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);
  const [startingBalance, setStartingBalance] = useState(0);
  const [dailyBalances, setDailyBalances] = useState<DailyBalance[]>([]);
  const [dailyFees, setDailyFees] = useState<DailyFee[]>([]);
  const [brokerAccounts, setBrokerAccounts] = useState<BrokerAccount[]>([]);
  // Which store feeds the series — the server picks exactly one (broker when
  // a brokerage is linked, statement uploads otherwise).
  const [balancesSource, setBalancesSource] = useState<'broker' | 'manual'>('manual');

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [tradesRes, prefsRes, balancesRes, feesRes, accountsRes] = await Promise.all([
        fetch('/api/trades?userId=default&perPage=1000').then((r) => r.json()).catch(() => ({})),
        fetch('/api/user/prefs').then((r) => r.json()).catch(() => ({})),
        fetch('/api/user/daily-balances').then((r) => r.json()).catch(() => ({})),
        fetch('/api/user/fees').then((r) => r.json()).catch(() => ({})),
        fetch('/api/snaptrade/accounts').then((r) => r.json()).catch(() => ({})),
      ]);
      if (tradesRes.success && tradesRes.data) setAllTrades(tradesRes.data.trades || []);
      if (prefsRes.success && prefsRes.prefs) setStartingBalance(prefsRes.prefs.startingBalance || 0);
      if (balancesRes.success && Array.isArray(balancesRes.balances)) setDailyBalances(balancesRes.balances);
      if (balancesRes.success) setBalancesSource(balancesRes.source === 'broker' ? 'broker' : 'manual');
      if (feesRes.success && Array.isArray(feesRes.fees)) setDailyFees(feesRes.fees);
      if (accountsRes.success && accountsRes.data?.accounts) setBrokerAccounts(accountsRes.data.accounts);
      else setBrokerAccounts([]);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData, refreshKey]);

  const hasManualTrades = useMemo(() => allTrades.some((t) => !t.brokerAccountId), [allTrades]);

  /**
   * The starting balance is a manual stand-in for data we don't have. Once a
   * brokerage feeds the account, balances come from the broker, so editing the
   * figure by hand would just fight the synced data. It stays editable while
   * the user is still the source: no brokerage linked, or manual trades remain.
   */
  const canEditStartingBalance = brokerAccounts.length === 0 || hasManualTrades;

  const handleSaveStartingBalance = useCallback((val: number) => {
    setStartingBalance(val);
    fetch('/api/user/prefs', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ startingBalance: val }),
    }).catch(() => {});
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-7 h-7 animate-spin" style={{ color: 'var(--accent)' }} />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header with period selector. Brokerage status lives in the Journal
          header only (compact pill) — this tab refetches on mount, so it
          always reflects the latest sync. */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>Performance</h2>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
            Track your account growth over time
          </p>
        </div>
        <div className="flex items-center gap-0.5 rounded-lg p-1" style={{ background: 'var(--surface-2)', border: '1px solid var(--border-default)' }}>
          {(Object.keys(PERIOD_LABELS) as Period[]).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className="px-3 py-1.5 rounded-md text-xs font-medium transition-all"
              style={{
                background: period === p ? 'var(--accent)' : 'transparent',
                color: period === p ? 'white' : 'var(--text-secondary)',
                boxShadow: period === p ? '0 1px 4px rgba(255,107,0,0.3)' : 'none',
              }}
            >
              {PERIOD_LABELS[p]}
            </button>
          ))}
        </div>
      </div>

      <DayTradingPerformance
        trades={allTrades}
        dailyBalances={dailyBalances}
        dailyFees={dailyFees}
        balancesSource={balancesSource}
        period={period}
        startingBalance={startingBalance}
        onSaveStartingBalance={handleSaveStartingBalance}
        showJournalInsights={journalInsightsAllowed}
        canEditStartingBalance={canEditStartingBalance}
      />
    </div>
  );
}
