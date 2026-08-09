'use client';

/**
 * Agents walkthrough — what Platinum members see on the Agents tab.
 *
 * The live agent terminal (ConfluenceView) is wired to the owner's own
 * brokerage and stays owner-only; a Platinum member instead gets a guided
 * walkthrough of how the agent works and how their own workspace gets set
 * up. Personal agent workspaces are provisioned with the team during
 * onboarding — the CTA below starts that conversation. No mock data, no
 * fake terminal.
 */

import { useState } from 'react';
import {
  Sparkles,
  Link2,
  SlidersHorizontal,
  ShieldCheck,
  ClipboardCheck,
  Mail,
  ChevronRight,
} from 'lucide-react';

const SUPPORT_EMAIL = 'confluencetradingsupport@gmail.com';

const STEPS = [
  {
    icon: Link2,
    title: '1 · Connect your brokerage',
    body: 'Your agent trades through your own brokerage account. If you connected a brokerage for journaling (Gold and up), that same connection is the foundation — the agent reads your positions and balances from it. During onboarding we verify the connection supports order placement.',
  },
  {
    icon: SlidersHorizontal,
    title: '2 · Apply a strategy',
    body: 'Choose a swing-trading strategy and set its guardrails: universe of tickers, maximum position size, maximum open positions, and daily loss limits. The agent only ever operates inside the box you define — strategies are applied per-account and can be paused at any time.',
  },
  {
    icon: ClipboardCheck,
    title: '3 · Review proposals',
    body: 'Every trading day the agent scans its universe and produces proposals — entries, exits, and protective-stop adjustments — each with its reasoning attached. Nothing executes until a proposal passes your guardrails, and you can require manual approval for every order while you build trust.',
  },
  {
    icon: ShieldCheck,
    title: '4 · Guardrails watch everything',
    body: 'Position caps, loss limits, and protective stops are enforced on every order — not suggested, enforced. A nightly reconciliation compares the agent’s book against your brokerage records and halts trading on any mismatch.',
  },
];

export default function AgentsWalkthrough() {
  const [expanded, setExpanded] = useState<number | null>(0);

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Hero */}
      <div
        className="rounded-2xl p-6 md:p-8"
        style={{ background: 'var(--surface-1)', border: '1px solid var(--border-default)' }}
      >
        <div className="flex items-center gap-3 mb-3">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ background: 'var(--accent-dim)' }}
          >
            <Sparkles className="w-5 h-5" style={{ color: 'var(--accent)' }} />
          </div>
          <div>
            <h2 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>
              Agents — your Platinum feature
            </h2>
            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
              Agentic swing trading with hard guardrails and human oversight
            </p>
          </div>
        </div>
        <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
          An agent is an AI trader that works a defined strategy inside limits you control: it
          scans a ticker universe, proposes entries and exits with its reasoning shown, manages
          protective stops, and reports every action for review. Here&apos;s how yours gets set
          up.
        </p>
      </div>

      {/* Steps */}
      <div className="space-y-3">
        {STEPS.map((step, i) => {
          const Icon = step.icon;
          const open = expanded === i;
          return (
            <button
              key={step.title}
              onClick={() => setExpanded(open ? null : i)}
              className="w-full text-left rounded-xl p-4 transition-colors"
              style={{
                background: open ? 'var(--surface-2)' : 'var(--surface-1)',
                border: '1px solid var(--border-default)',
              }}
            >
              <div className="flex items-center gap-3">
                <Icon className="w-4 h-4 shrink-0" style={{ color: 'var(--accent)' }} />
                <span className="text-sm font-semibold flex-1" style={{ color: 'var(--text-primary)' }}>
                  {step.title}
                </span>
                <ChevronRight
                  className="w-4 h-4 transition-transform"
                  style={{
                    color: 'var(--text-secondary)',
                    transform: open ? 'rotate(90deg)' : 'none',
                  }}
                />
              </div>
              {open && (
                <p className="mt-3 text-sm leading-relaxed pl-7" style={{ color: 'var(--text-secondary)' }}>
                  {step.body}
                </p>
              )}
            </button>
          );
        })}
      </div>

      {/* CTA */}
      <div
        className="rounded-2xl p-6 text-center"
        style={{ background: 'var(--surface-1)', border: '1px solid var(--border-default)' }}
      >
        <h3 className="text-sm font-bold mb-1" style={{ color: 'var(--text-primary)' }}>
          Ready to set up your agent?
        </h3>
        <p className="text-xs mb-4" style={{ color: 'var(--text-secondary)' }}>
          Agent workspaces are provisioned one-on-one so your strategy, guardrails, and brokerage
          connection are configured correctly from day one. Email us and we&apos;ll get you
          scheduled.
        </p>
        <a
          href={`mailto:${SUPPORT_EMAIL}?subject=Agent%20onboarding`}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-opacity hover:opacity-90"
          style={{ background: 'var(--accent)', color: '#fff' }}
        >
          <Mail className="w-4 h-4" />
          Start agent onboarding
        </a>
      </div>
    </div>
  );
}
