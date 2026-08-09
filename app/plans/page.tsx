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

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Check, Sparkles, Gift, Loader2, ArrowLeft, Star, Info } from 'lucide-react';
import { TIER_PRICING, TIER_LABELS, ANNUAL_DISCOUNT, PLATINUM_COMING_SOON, CARD_ON_FILE_TRIAL, TRIAL_DAYS, type Tier } from '@/lib/entitlements';
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
  // Post-checkout return state. Stripe sends the user back here; the
  // entitlement is written by the webhook, which can land a beat later — so
  // confirm by polling rather than assuming, and never leave the page silent.
  const [checkoutState, setCheckoutState] = useState<'idle' | 'confirming' | 'success' | 'slow' | 'cancelled'>('idle');

  const tier = status.entitlements.tier;

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const outcome = params.get('checkout');
    if (!outcome) return;
    // Clear the query so a refresh doesn't replay this.
    window.history.replaceState({}, '', '/plans');

    if (outcome === 'cancelled') {
      setCheckoutState('cancelled');
      return;
    }
    if (outcome !== 'success') return;

    setCheckoutState('confirming');
    let cancelled = false;
    let tries = 0;
    const poll = async () => {
      tries++;
      try {
        const res = await fetch('/api/user/entitlements', { cache: 'no-store' });
        const json = await res.json();
        const s = json?.status;
        if (s?.source === 'billing' || s?.entitlements?.tier === 'gold' || s?.entitlements?.tier === 'platinum') {
          if (cancelled) return;
          invalidateEntitlements();
          setCheckoutState('success');
          return;
        }
      } catch {
        // keep polling; a transient failure shouldn't end the confirmation
      }
      if (cancelled) return;
      if (tries < 12) setTimeout(poll, 1500);
      else setCheckoutState('slow');
    };
    poll();
    return () => {
      cancelled = true;
    };
  }, []);

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

  async function openBillingPortal() {
    setBusy('portal');
    setNotice(null);
    try {
      const res = await fetch('/api/billing/portal', { method: 'POST' });
      const json = await res.json();
      if (json.success && json.url) {
        window.location.href = json.url;
        return;
      }
      setNotice(json.error || 'Could not open the billing portal.');
    } catch {
      setNotice('Could not open the billing portal.');
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
        <div className="flex flex-wrap items-center justify-between gap-3 mb-8">
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
              {status.source === 'billing' && (
                <button
                  onClick={openBillingPortal}
                  disabled={busy !== null}
                  className="ml-2 underline hover:text-white transition-colors disabled:opacity-60"
                >
                  Manage billing
                </button>
              )}
            </span>
          )}
        </div>

        {/* Post-checkout confirmation */}
        {checkoutState !== 'idle' && (
          <div
            className={`mb-8 rounded-2xl border p-5 ${
              checkoutState === 'cancelled'
                ? 'border-[#30363d] bg-[#161b22]'
                : 'border-[#3fb950]/40 bg-[#3fb950]/10'
            }`}
          >
            {checkoutState === 'confirming' && (
              <div className="flex items-center gap-3">
                <Loader2 className="w-5 h-5 animate-spin text-[#3fb950] shrink-0" />
                <div>
                  <p className="text-sm font-semibold">Confirming your payment…</p>
                  <p className="text-xs text-[#8b949e]">This usually takes a couple of seconds.</p>
                </div>
              </div>
            )}
            {checkoutState === 'success' && (
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-start gap-3">
                  <Check className="w-5 h-5 text-[#3fb950] shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold">You&apos;re on Gold — welcome aboard.</p>
                    <p className="text-xs text-[#8b949e]">
                      Your receipt is on its way by email. Connect your brokerage and the journal
                      starts filling itself.
                    </p>
                  </div>
                </div>
                <Link
                  href="/?tab=trading"
                  className="shrink-0 px-5 py-2.5 rounded-lg bg-[#F97316] hover:bg-[#fb8c3c] text-white text-sm font-semibold transition-colors text-center"
                >
                  Go to your journal
                </Link>
              </div>
            )}
            {checkoutState === 'slow' && (
              <div className="flex items-start gap-3">
                <Check className="w-5 h-5 text-[#3fb950] shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold">Payment received — finishing up.</p>
                  <p className="text-xs text-[#8b949e]">
                    Your plan is taking a moment to activate. Refresh in a minute; if it still
                    hasn&apos;t updated, reply to your receipt email and we&apos;ll sort it out
                    immediately.
                  </p>
                </div>
              </div>
            )}
            {checkoutState === 'cancelled' && (
              <div>
                <p className="text-sm font-semibold">Checkout cancelled — you weren&apos;t charged.</p>
                <p className="text-xs text-[#8b949e]">
                  Silver stays free forever, and the Gold trial is still available if you want to
                  try it first.
                </p>
              </div>
            )}
          </div>
        )}

        <div className="text-center mb-8">
          <h1 className="text-3xl md:text-4xl font-bold mb-2">Choose your plan</h1>
          <p className="text-[#8b949e] text-sm md:text-base">
            Every plan is focused on one thing: making you a more disciplined trader.
          </p>
        </div>

        {/* Trial banner — the card-on-file terms are stated here and again
            beside the Gold button, since this is a negative-option offer. */}
        {!loading && status.trialAvailable && (
          <div className="mb-8 rounded-2xl border border-[#F97316]/40 bg-gradient-to-r from-[#F97316]/10 to-transparent p-5 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Sparkles className="w-5 h-5 text-[#F97316] shrink-0" />
              <div>
                <p className="text-sm font-semibold">Try Gold free for {TRIAL_DAYS} days</p>
                <p className="text-xs text-[#8b949e]">
                  {CARD_ON_FILE_TRIAL ? (
                    <>
                      Full Gold access — brokerage sync, AI insights, briefings. We save your card
                      and charge ${TIER_PRICING.gold.monthly}/month when the trial ends; cancel
                      before then and you pay nothing. We email you first.
                    </>
                  ) : (
                    <>Full Gold access — brokerage sync, AI insights, briefings. No card required.</>
                  )}
                </p>
              </div>
            </div>
            <button
              onClick={() => (CARD_ON_FILE_TRIAL ? choosePlan('gold') : startTrial())}
              disabled={busy !== null}
              className="shrink-0 px-5 py-2.5 rounded-lg bg-[#F97316] hover:bg-[#fb8c3c] text-white text-sm font-semibold transition-colors disabled:opacity-60 inline-flex items-center gap-2"
            >
              {(busy === 'trial' || busy === 'gold') && <Loader2 className="w-4 h-4 animate-spin" />}
              Start free {TRIAL_DAYS}-day trial
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
                {t === 'gold' && CARD_ON_FILE_TRIAL && status.trialAvailable && (
                  <p className="mt-3 text-[10px] text-[#8b949e] leading-snug">
                    Free for {TRIAL_DAYS} days, then ${TIER_PRICING.gold[cycle]}/
                    {cycle === 'monthly' ? 'month' : 'year'}. Your card is saved now and charged
                    when the trial ends — cancel any time before then in two clicks and you
                    won&apos;t be charged.
                  </p>
                )}
                {t === 'platinum' && PLATINUM_COMING_SOON && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-[#d29922] text-[#1a1206] text-[10px] font-bold uppercase tracking-wider">
                    Coming soon
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
                    disabled={busy !== null || isCurrent || (t === 'platinum' && PLATINUM_COMING_SOON)}
                    className={`w-full py-2.5 rounded-lg text-sm font-semibold transition-colors inline-flex items-center justify-center gap-2 disabled:opacity-60 ${
                      popular
                        ? 'bg-[#F97316] hover:bg-[#fb8c3c] text-white'
                        : 'bg-[#21262d] hover:bg-[#30363d] text-white border border-[#30363d]'
                    }`}
                  >
                    {busy === t && <Loader2 className="w-4 h-4 animate-spin" />}
                    {isCurrent
                      ? 'Your current plan'
                      : t === 'platinum' && PLATINUM_COMING_SOON
                        ? 'Coming soon'
                        : `Choose ${TIER_LABELS[t]}`}
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

        {/* Manage / cancel — explicit, not buried in the Silver card */}
        {!loading && tier !== 'silver' && status.source !== 'owner' && (
          <div className="max-w-2xl mx-auto mb-10 rounded-2xl border border-[#30363d] bg-[#161b22] p-5 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="text-center sm:text-left">
              <p className="text-sm font-semibold">Manage your subscription</p>
              <p className="text-xs text-[#8b949e] mt-0.5">
                Update your card, see invoices, or cancel — your journal and data stay either way.
              </p>
            </div>
            <div className="flex gap-2 shrink-0">
              {status.source === 'billing' && (
                <button
                  onClick={openBillingPortal}
                  disabled={busy !== null}
                  className="px-4 py-2 rounded-lg bg-[#21262d] hover:bg-[#30363d] border border-[#30363d] text-sm font-semibold transition-colors disabled:opacity-60 inline-flex items-center gap-2"
                >
                  {busy === 'portal' && <Loader2 className="w-4 h-4 animate-spin" />}
                  Manage billing
                </button>
              )}
              <button
                onClick={cancelPlan}
                disabled={busy !== null}
                className="px-4 py-2 rounded-lg border border-[#f85149]/40 text-[#f85149] hover:bg-[#f85149]/10 text-sm font-semibold transition-colors disabled:opacity-60 inline-flex items-center gap-2"
              >
                {busy === 'cancel' && <Loader2 className="w-4 h-4 animate-spin" />}
                Cancel plan
              </button>
            </div>
          </div>
        )}

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
