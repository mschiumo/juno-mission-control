'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { Loader2 } from 'lucide-react';
import BrokerageSyncBar from '@/components/trading/BrokerageSyncBar';
import AccountToggle, { type PerfAccount } from '@/components/trading/AccountToggle';
import DayTradingPerformance from '@/components/trading/DayTradingPerformance';
import LongTermPerformance from '@/components/trading/LongTermPerformance';
import {
  type Trade, type DailyBalance, type Period, PERIOD_LABELS,
} from '@/components/trading/performance-shared';
import type { AccountType, AccountSettingsMap } from '@/lib/db/account-settings';
import type { BrokerAccount } from '@/lib/db/broker-connections';

const ALL_ID = 'all';
const MANUAL_ID = 'manual';

export default function PerformanceView({ refreshKey }: { refreshKey?: number }) {
  const [period, setPeriod] = useState<Period>('all');
  const [allTrades, setAllTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);
  const [startingBalance, setStartingBalance] = useState(0);
  const [allDailyBalances, setAllDailyBalances] = useState<DailyBalance[]>([]);
  const [brokerAccounts, setBrokerAccounts] = useState<BrokerAccount[]>([]);
  const [accountSettings, setAccountSettings] = useState<AccountSettingsMap>({});
  const [selectedAccountId, setSelectedAccountId] = useState<string>(ALL_ID);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [tradesRes, prefsRes, balancesRes, accountsRes, settingsRes] = await Promise.all([
        fetch('/api/trades?userId=default&perPage=1000').then((r) => r.json()).catch(() => ({})),
        fetch('/api/user/prefs').then((r) => r.json()).catch(() => ({})),
        fetch('/api/user/daily-balances').then((r) => r.json()).catch(() => ({})),
        // Owner-only; non-owners get 403 → treat as no connected brokerages.
        fetch('/api/snaptrade/accounts').then((r) => r.json()).catch(() => ({})),
        fetch('/api/user/account-settings').then((r) => r.json()).catch(() => ({})),
      ]);
      if (tradesRes.success && tradesRes.data) setAllTrades(tradesRes.data.trades || []);
      if (prefsRes.success && prefsRes.prefs) setStartingBalance(prefsRes.prefs.startingBalance || 0);
      if (balancesRes.success && Array.isArray(balancesRes.balances)) setAllDailyBalances(balancesRes.balances);
      if (accountsRes.success && accountsRes.data?.accounts) setBrokerAccounts(accountsRes.data.accounts);
      else setBrokerAccounts([]);
      if (settingsRes.success && settingsRes.settings) setAccountSettings(settingsRes.settings);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData, refreshKey]);

  const hasManualTrades = useMemo(() => allTrades.some((t) => !t.brokerAccountId), [allTrades]);

  // Resolve the toggle's account list: All + Manual (if any) + connected brokers.
  const accounts = useMemo<PerfAccount[]>(() => {
    const list: PerfAccount[] = [
      { id: ALL_ID, label: 'All Accounts', type: 'day-trading', editable: false },
    ];
    if (hasManualTrades) {
      const s = accountSettings[MANUAL_ID];
      list.push({
        id: MANUAL_ID,
        label: s?.label || 'Manual / Imported',
        type: s?.type || 'day-trading',
        editable: true,
      });
    }
    for (const acct of brokerAccounts) {
      const s = accountSettings[acct.id];
      list.push({
        id: acct.id,
        label: s?.label || acct.brokerage || acct.name,
        sublabel: acct.number,
        type: s?.type || 'day-trading',
        editable: true,
      });
    }
    return list;
  }, [hasManualTrades, brokerAccounts, accountSettings]);

  // Keep the selection valid if accounts change (e.g. a broker disconnects).
  useEffect(() => {
    if (!accounts.some((a) => a.id === selectedAccountId)) setSelectedAccountId(ALL_ID);
  }, [accounts, selectedAccountId]);

  const selected = accounts.find((a) => a.id === selectedAccountId) ?? accounts[0];

  // Filter trades for the selected account.
  const accountTrades = useMemo<Trade[]>(() => {
    if (selectedAccountId === ALL_ID) return allTrades;
    if (selectedAccountId === MANUAL_ID) return allTrades.filter((t) => !t.brokerAccountId);
    return allTrades.filter((t) => t.brokerAccountId === selectedAccountId);
  }, [allTrades, selectedAccountId]);

  // Daily balances are aggregate — only meaningful for the combined view.
  const accountBalances = selectedAccountId === ALL_ID ? allDailyBalances : [];

  // Starting balance: combined + manual reuse the global prefs value (that's
  // where today's ToS statements set it); broker accounts store their own.
  const accountStartingBalance = useMemo(() => {
    if (selectedAccountId === ALL_ID) return startingBalance;
    const s = accountSettings[selectedAccountId];
    if (s?.startingBalance != null) return s.startingBalance;
    return selectedAccountId === MANUAL_ID ? startingBalance : 0;
  }, [selectedAccountId, startingBalance, accountSettings]);

  const handleSaveStartingBalance = useCallback((val: number) => {
    if (selectedAccountId === ALL_ID) {
      setStartingBalance(val);
      fetch('/api/user/prefs', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ startingBalance: val }),
      }).catch(() => {});
      return;
    }
    // Manual also updates the shared prefs value so the combined view stays aligned.
    if (selectedAccountId === MANUAL_ID) setStartingBalance(val);
    setAccountSettings((prev) => ({ ...prev, [selectedAccountId]: { ...(prev[selectedAccountId] ?? { type: 'day-trading' }), startingBalance: val } }));
    fetch('/api/user/account-settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accountId: selectedAccountId, startingBalance: val }),
    }).catch(() => {});
  }, [selectedAccountId]);

  const handleSaveAccount = useCallback(async (accountId: string, updates: { label: string; type: AccountType }) => {
    // Optimistic local update, then persist.
    setAccountSettings((prev) => ({
      ...prev,
      [accountId]: { ...(prev[accountId] ?? {}), label: updates.label || undefined, type: updates.type },
    }));
    try {
      const res = await fetch('/api/user/account-settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId, label: updates.label, type: updates.type }),
      }).then((r) => r.json());
      if (res.success && res.settings) setAccountSettings(res.settings);
    } catch { /* keep optimistic value */ }
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-7 h-7 animate-spin" style={{ color: 'var(--accent)' }} />
      </div>
    );
  }

  const isLongTerm = selected.type === 'long-term' && selected.id !== ALL_ID;

  return (
    <div className="space-y-5">
      {/* Brokerage connection + sync status (shared with the Journal tab) */}
      <BrokerageSyncBar onSynced={loadData} />

      {/* Header with period selector */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>Performance</h2>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>Track your account growth over time</p>
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

      {/* Per-account toggle (hidden when there's only a single account) */}
      <AccountToggle
        accounts={accounts}
        selectedId={selectedAccountId}
        onSelect={setSelectedAccountId}
        onSave={handleSaveAccount}
      />

      {/* Branch: long-term investing vs day-trading layout */}
      {isLongTerm ? (
        <LongTermPerformance
          trades={accountTrades}
          period={period}
          startingBalance={accountStartingBalance}
          label={selected.label}
        />
      ) : (
        <DayTradingPerformance
          trades={accountTrades}
          dailyBalances={accountBalances}
          period={period}
          startingBalance={accountStartingBalance}
          onSaveStartingBalance={handleSaveStartingBalance}
          showJournalInsights={selectedAccountId === ALL_ID}
        />
      )}
    </div>
  );
}
