'use client';

/**
 * Plan picker + checkout.
 *
 * Signed-in users choose a tier and billing cycle here. New accounts land
 * here from the app shell until they hold a plan. Fully working today:
 * the 7-day Gold trial and referral-code redemption. Paid checkout posts to
 * /api/billing/checkout, which is the seam Stripe plugs into — until it goes
 * live the server answers BILLING_NOT_LIVE and the UI steers to the trial.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Check, Sparkles, Gift, Loader2, ArrowLeft, Star, Info } from 'lucide-react';
import { TIER_PRICING, TIER_LABELS, ANNUAL_DISCOUNT, type Tier } from '@/lib/entitlements';
import { usePlanStatus, invalidateEntitlements } from '@/lib/use-entitlements';

type Cycle = 'monthly' | 'annual';

const TIER_FEATURES_COPY: Record<Tier, { blurb: string; features: string[] }> = {
  silver: {
    blurb: 'Everything you need to trade with discipline — free, forever.',
    features: [
      'Trading journal — import broker statements in one click',
      'Risk-first trade planning — entry, stop & target with dollar risk and share size',
      'Performance analytics — equity curve, win rate & strategy breakdown',
      'Market news screener, tagged by sentiment & category',
      'Profit projection — stress-test your win rate and R:R',
      'Docs & trading guides',
    ],
  },
  gold: {
    blurb: 'Your journal builds itself — and AI coaches what it finds.',
    features: [
      'Everything in Silver',
      'Auto-synced journal — trades, P&L and balances flow in from your broker',
      'Pre-market gap scanner & live market data, all session long',
      'AI morning briefing in your inbox before the bell',
      'AI coaching reports — surface your patterns, strengths & leaks',
      'Trading goals that track themselves from your real results',
    ],
  },
  platinum: {
    blurb: 'AI-scouted swing setups. You approve every order.',
    features: [
      'Everything in Gold',
      'AI-identified swing-trade setups, with the reasoning attached',
      'You approve every order — review, adjust, or reject each proposal',
      'Full trade-lifecycle visibility — orders, fills, stops & progress in one terminal',
      'Guided onboarding — strategies, guardrails & brokerage wiring',
    ],
  },
};

export default function PlansPage() {
  const router = useRouter();
  const { status, loading } = usePlanStatus();
  const [cycle, setCycle] = useState<Cycle>('monthly');
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [referralCode, setReferralCode] = useState('');
  const [referralError, setReferralError] = useState<string | null>(null);

  const tier = status.entitlements.tier;

  async function startTrial() {
    setBusy('trial');
    setNotice(null);
    try {
      const res = await fetch('/api/user/plan/trial', { method: 'POST' });
      const json = await res.json();
      if (json.success) {
        invalidateEntitlements();
        router.push('/');
        return;
      }
      setNotice(json.error || 'Could not start the trial.');
    } catch {
      setNotice('Could not start the trial.');
    } finally {
      setBusy(null);
    }
  }

  async function redeemReferral() {
    if (!referralCode.trim()) return;
    setBusy('referral');
    setReferralError(null);
    try {
      const res = await fetch('/api/user/plan/referral', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: referralCode }),
      });
      const json = await res.json();
      if (json.success) {
        invalidateEntitlements();
        router.push('/');
        return;
      }
      setReferralError(json.error || 'Could not redeem that code.');
    } catch {
      setReferralError('Could not redeem that code.');
    } finally {
      setBusy(null);
    }
  }

  async function choosePlan(chosen: Tier) {
    setBusy(chosen);
    setNotice(null);
    try {
      const res = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tier: chosen, cycle }),
      });
      const json = await res.json();
      if (json.success && json.url) {
        // Stripe Checkout — live once billing ships.
        window.location.href = json.url;
        return;
      }
      setNotice(json.error || 'Checkout is not available yet.');
    } catch {
      setNotice('Checkout is not available yet.');
    } finally {
      setBusy(null);
    }
  }

  async function cancelPlan() {
    if (!window.confirm('Downgrade to the free Silver plan? Your brokerage connection will be disconnected immediately and paid features will stop.')) return;
    setBusy('cancel');
    setNotice(null);
    try {
      const res = await fetch('/api/user/plan/cancel', { method: 'POST' });
      const json = await res.json();
      if (json.success) {
        invalidateEntitlements();
        router.push('/');
        return;
      }
      setNotice(json.error || 'Could not cancel the plan.');
    } catch {
      setNotice('Could not cancel the plan.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="min-h-screen bg-[#0d1117] text-white">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-sm text-[#8b949e] hover:text-white transition-colors"
          >
            <ArrowLeft className="w-4 h-4" /> Back to the app
          </Link>
          {!loading && (
            <span className="text-xs px-3 py-1.5 rounded-full bg-[#F97316]/10 text-[#F97316] font-semibold">
              Current plan: {TIER_LABELS[tier]}
              {tier === 'silver' && status.source !== 'owner' && ' (free)'}
              {status.source === 'trial' && ' (free trial)'}
              {status.source === 'referral' && ' (referral)'}
              {status.expiresAt && ` · until ${new Date(status.expiresAt).toLocaleDateString()}`}
            </span>
          )}
        </div>

        <div className="text-center mb-8">
          <h1 className="text-3xl md:text-4xl font-bold mb-2">Choose your plan</h1>
          <p className="text-[#8b949e] text-sm md:text-base">
            Every plan is focused on one thing: making you a more disciplined trader.
          </p>
        </div>

        {/* Trial banner */}
        {!loading && status.trialAvailable && (
          <div className="mb-8 rounded-2xl border border-[#F97316]/40 bg-gradient-to-r from-[#F97316]/10 to-transparent p-5 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Sparkles className="w-5 h-5 text-[#F97316] shrink-0" />
              <div>
                <p className="text-sm font-semibold">Try Gold free for 7 days</p>
                <p className="text-xs text-[#8b949e]">
                  Full Gold access — brokerage sync, AI insights, briefings. No card required.
                </p>
              </div>
            </div>
            <button
              onClick={startTrial}
              disabled={busy !== null}
              className="shrink-0 px-5 py-2.5 rounded-lg bg-[#F97316] hover:bg-[#fb8c3c] text-white text-sm font-semibold transition-colors disabled:opacity-60 inline-flex items-center gap-2"
            >
              {busy === 'trial' && <Loader2 className="w-4 h-4 animate-spin" />}
              Start free week
            </button>
          </div>
        )}

        {notice && (
          <div className="mb-6 rounded-xl border border-[#30363d] bg-[#161b22] px-4 py-3 text-sm text-[#c9d1d9] text-center">
            {notice}
          </div>
        )}

        {/* Cycle toggle */}
        <div className="flex items-center justify-center gap-2 mb-8">
          <button
            onClick={() => setCycle('monthly')}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
              cycle === 'monthly' ? 'bg-[#F97316] text-white' : 'bg-[#161b22] text-[#8b949e] border border-[#30363d]'
            }`}
          >
            Monthly
          </button>
          <button
            onClick={() => setCycle('annual')}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
              cycle === 'annual' ? 'bg-[#F97316] text-white' : 'bg-[#161b22] text-[#8b949e] border border-[#30363d]'
            }`}
          >
            Annual
            <span className={`ml-1.5 text-[10px] font-bold ${cycle === 'annual' ? 'text-white/90' : 'text-[#3fb950]'}`}>
              save {Math.round(ANNUAL_DISCOUNT * 100)}%
            </span>
          </button>
        </div>

        {/* Tier cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-10">
          {(['silver', 'gold', 'platinum'] as Tier[]).map((t) => {
            const popular = t === 'gold';
            const price = TIER_PRICING[t][cycle];
            const isCurrent = tier === t;
            return (
              <div
                key={t}
                className={`relative rounded-2xl p-6 flex flex-col ${
                  popular
                    ? 'border-2 border-[#F97316] bg-[#161b22] shadow-[0_0_40px_rgba(249,115,22,0.15)]'
                    : 'border border-[#30363d] bg-[#161b22]'
                }`}
              >
                {popular && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-[#F97316] text-white text-[10px] font-bold uppercase tracking-wider inline-flex items-center gap-1">
                    <Star className="w-3 h-3" /> Most popular
                  </span>
                )}
                <h2 className="text-lg font-bold mb-1">{TIER_LABELS[t]}</h2>
                <p className="text-xs text-[#8b949e] mb-4 min-h-[32px]">{TIER_FEATURES_COPY[t].blurb}</p>
                <div className="mb-5">
                  {t === 'silver' ? (
                    <span className="text-3xl font-bold">Free</span>
                  ) : (
                    <>
                      <span className="text-3xl font-bold">${price.toFixed(2)}</span>
                      <span className="text-sm text-[#8b949e]">/{cycle === 'monthly' ? 'mo' : 'yr'}</span>
                    </>
                  )}
                  {t !== 'silver' && cycle === 'annual' && (
                    <p className="text-[11px] text-[#3fb950] mt-1">
                      vs ${(TIER_PRICING[t].monthly * 12).toFixed(2)} paid monthly — save $
                      {(TIER_PRICING[t].monthly * 12 - price).toFixed(2)}/yr
                    </p>
                  )}
                </div>
                <ul className="space-y-2.5 mb-6 flex-1">
                  {TIER_FEATURES_COPY[t].features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-[13px] text-[#c9d1d9]">
                      <Check className="w-4 h-4 text-[#3fb950] shrink-0 mt-0.5" />
                      {f}
                    </li>
                  ))}
                </ul>
                {t === 'silver' ? (
                  isCurrent ? (
                    <div className="w-full py-2.5 rounded-lg text-sm font-semibold text-center bg-[#21262d] text-[#8b949e] border border-[#30363d]">
                      Your current plan
                    </div>
                  ) : (
                    <button
                      onClick={cancelPlan}
                      disabled={busy !== null || status.source === 'owner'}
                      className="w-full py-2.5 rounded-lg text-sm font-semibold transition-colors inline-flex items-center justify-center gap-2 disabled:opacity-60 bg-[#21262d] hover:bg-[#30363d] text-white border border-[#30363d]"
                    >
                      {busy === 'cancel' && <Loader2 className="w-4 h-4 animate-spin" />}
                      Downgrade to Free
                    </button>
                  )
                ) : (
                  <button
                    onClick={() => choosePlan(t)}
                    disabled={busy !== null || isCurrent}
                    className={`w-full py-2.5 rounded-lg text-sm font-semibold transition-colors inline-flex items-center justify-center gap-2 disabled:opacity-60 ${
                      popular
                        ? 'bg-[#F97316] hover:bg-[#fb8c3c] text-white'
                        : 'bg-[#21262d] hover:bg-[#30363d] text-white border border-[#30363d]'
                    }`}
                  >
                    {busy === t && <Loader2 className="w-4 h-4 animate-spin" />}
                    {isCurrent ? 'Your current plan' : `Choose ${TIER_LABELS[t]}`}
                  </button>
                )}
                {t === 'platinum' && (
                  <p className="mt-3 text-[10px] text-[#8b949e] leading-snug flex items-start gap-1.5">
                    <Info className="w-3 h-3 shrink-0 mt-0.5" />
                    Agents currently execute through a dedicated Robinhood connection set up during
                    onboarding. Journaling works with any SnapTrade-supported broker.
                  </p>
                )}
              </div>
            );
          })}
        </div>

        {/* Referral code */}
        {!loading && status.referralAvailable && (
          <div className="max-w-md mx-auto rounded-2xl border border-[#30363d] bg-[#161b22] p-5">
            <div className="flex items-center gap-2 mb-3">
              <Gift className="w-4 h-4 text-[#F97316]" />
              <h3 className="text-sm font-semibold">Have a referral code?</h3>
            </div>
            <div className="flex gap-2">
              <input
                value={referralCode}
                onChange={(e) => setReferralCode(e.target.value)}
                placeholder="Enter code"
                className="flex-1 bg-[#0d1117] border border-[#30363d] rounded-lg px-3 py-2 text-sm placeholder-[#484f58] focus:outline-none focus:border-[#F97316]"
              />
              <button
                onClick={redeemReferral}
                disabled={busy !== null || !referralCode.trim()}
                className="px-4 py-2 rounded-lg bg-[#21262d] hover:bg-[#30363d] border border-[#30363d] text-sm font-semibold transition-colors disabled:opacity-60 inline-flex items-center gap-2"
              >
                {busy === 'referral' && <Loader2 className="w-4 h-4 animate-spin" />}
                Apply
              </button>
            </div>
            {referralError && <p className="mt-2 text-xs text-[#f85149]">{referralError}</p>}
            <p className="mt-2 text-[11px] text-[#8b949e]">
              Referral codes unlock a free month of Gold. One redemption per account.
            </p>
          </div>
        )}

        {/* Risk disclaimer */}
        <div className="max-w-2xl mx-auto mt-10 text-center">
          <p className="text-[11px] text-[#8b949e] leading-relaxed">
            ConfluenceTrading is a journaling and analytics tool. Nothing in this product is
            financial, investment, or trading advice. Trading involves substantial risk of loss;
            all trading decisions and their outcomes are your own responsibility. By subscribing
            you agree to our{' '}
            <Link href="/terms" className="text-[#F97316] hover:underline">
              Terms &amp; Conditions
            </Link>
            .
          </p>
        </div>
      </div>
    </div>
  );
}
