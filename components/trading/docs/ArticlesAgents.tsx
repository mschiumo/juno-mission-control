'use client';

import { ReactNode } from 'react';
import { DocSection, P, Em, Bullets, Steps, Step, Tip, Note, Warn, UI, OwnerBadge, TierBadge, FeatureLink, DocLink, Figure, RefTable, Kbd } from './DocsPrimitives';
import { ProposalCardFigure, ScorecardFigure } from './DocsFigures';

// ---------------------------------------------------------------------------
// Agents (agentic trading terminal)
// ---------------------------------------------------------------------------

export function AgentsArticle() {
  return (
    <div className="space-y-8">
      <div className="flex items-center gap-2">
        <TierBadge tier="platinum" />
      </div>
      <P>
        Agents is ConfluenceTrading&apos;s agentic swing-trading system. Its operating principle is printed right in
        the terminal header: <Em>Agent proposes · you approve · service executes.</Em> The agentic part is trade{' '}
        <Em>identification</Em> — an agent screens a ticker universe against a strategy each pre-open and writes up the
        setups it finds, with its reasoning attached. It is not automated trading: nothing reaches your broker without
        your explicit approval on that specific order.
      </P>
      <div>
        <FeatureLink subtab="agents">Open Agents</FeatureLink>
      </div>

      <DocSection title="Getting your agent set up">
        <P>
          Agent workspaces are provisioned one-on-one rather than self-serve, because a misconfigured strategy or an
          unverified brokerage connection is the kind of mistake that costs money. Opening the Agents tab on Platinum
          shows the four setup stages and a button to start onboarding.
        </P>
        <Steps>
          <Step title="Connect your brokerage">
            Your agent trades through your own brokerage account. If you already linked one for journaling, that same
            connection is the foundation — the agent reads your positions and balances from it. During onboarding the
            connection is verified to make sure it supports order placement, which is a stronger permission than the
            read-only link journaling uses. See <DocLink doc="brokerage-sync">Brokerage Sync</DocLink>.
          </Step>
          <Step title="Apply a strategy">
            Pick a swing-trading strategy and set its guardrails: the universe of tickers, maximum position size,
            maximum open positions, and daily loss limits. The agent only ever operates inside the box you define.
            Strategies are applied per account and can be paused at any time.
          </Step>
          <Step title="Review and approve every trade">
            Each trading day the agent scans its universe and surfaces proposals — entries, exits, and protective-stop
            adjustments. You approve, adjust, or reject each one.
          </Step>
          <Step title="Watch it in the terminal">
            Proposals, working orders, fills, protective stops, and P&amp;L progress all live in one screen, so you
            always know exactly what your agent is doing.
          </Step>
        </Steps>
        <Note>
          The live terminal drives a real brokerage account, so it is enabled per workspace as part of onboarding. The
          rest of this article describes what that terminal does once yours is running.
        </Note>
      </DocSection>

      <DocSection title="Reading the header">
        <Bullets
          items={[
            <>
              <Em>BUYING POWER</Em> — the account&apos;s available buying power. It turns red when pending proposals
              exceed it, and a banner explains which proposals are blocked.
            </>,
            <>
              A red <UI>Disarmed</UI> pill means the kill switch is engaged: approvals are recorded but no orders are
              placed.
            </>,
            <>
              The <UI>PAPER MODE</UI> / <UI>LIVE MODE</UI> pill shows which account the service is pointed at. Paper
              balances are never displayed as live ones — the pill is the source of truth for which is which.
            </>,
            <>
              The <Em>run banner</Em> summarizes the last agent screen in plain English — how many symbols were
              screened, how many passed the value gate, and why zero proposals can be a feature (&ldquo;the strategy
              being selective&rdquo;). It warns in amber if the last run is more than 24 hours old.
            </>,
          ]}
        />
      </DocSection>

      <DocSection title="The terminal sections">
        <P>
          The terminal is split into segmented sections — jump between them with keys <Kbd>1</Kbd>–<Kbd>7</Kbd>.
        </P>
        <RefTable
          rows={[
            ['Proposals', 'Pending trade ideas awaiting your decision (details below).'],
            ['Orders', 'Every order with lifecycle chips — Working, Filled, Cancelled — plus per-order Refresh (a real broker poll) and Cancel. A side rail shows current positions and upcoming proposals.'],
            ['Positions', 'The open book on its own: what the agent currently holds, at what cost, and where each position stands.'],
            ['Performance', 'KPIs for the agentic account: account value, buying power, total and unrealized P&L, invested cost, open exposure vs. its cap, proposal counts, and filled orders — plus an account-value chart and open-positions table.'],
            ['Review', 'A scorecard grading discretionary and agentic trading on the same terms — R-multiples, expectancy, payoff, per-symbol churn, and rule violations — with a narrative weekly review written every Saturday.'],
            ['Audit', 'An immutable event trail of everything that happened — every proposal event and order status change, stamped with who did it (agent, you, or the system).'],
            ['Strategy', 'The active strategy with a rules breakdown generated from the live strategy parameters — what you read is exactly what the code enforces.'],
            ['Settings', 'Arming, paper/live, account pinning, auto take-profit, and exposure caps (details below).'],
          ]}
        />
      </DocSection>

      <DocSection title="Reviewing a proposal">
        <Figure caption="A proposal card: thesis, fundamentals, price levels — and the three decisions.">
          <ProposalCardFigure />
        </Figure>
        <Steps>
          <Step title="Read the thesis">
            Each card shows the symbol and direction, the agent&apos;s reasoning, a fundamentals grid, a live quote
            line, and the proposed stop and target.
          </Step>
          <Step title="Decide">
            <UI>Approve</UI> sends it to the execution service. <UI>Reject</UI> declines it. <UI>Edit</UI> opens the
            limit price, quantity, stop, target, and time-in-force for adjustment — the button becomes{' '}
            <UI>Approve edited</UI>.
          </Step>
          <Step title="Watch it in Orders">
            Approved proposals become orders; follow their lifecycle in the Orders section. Once an entry fills (while
            armed), the service automatically places a GTC stop at your approved stop price.
          </Step>
        </Steps>
        <Note>
          Approval has hard safety rails: a proposal without a stop is refused, the limit is re-priced against a
          current quote at the moment you approve rather than the stale close the agent screened on, and the maximum
          loss implied by the stop must fit your configured risk budget. Oversized proposals are &ldquo;sized
          out&rdquo; and reported in the run banner.
        </Note>
      </DocSection>

      <DocSection title="Settings and safety">
        <RefTable
          rows={[
            ['Arm / kill switch', 'The master switch. Ships disarmed. Until you arm execution, approvals never place real orders.'],
            ['Paper / Live', 'Live mode requires a server-side allow flag and a pinned agentic account, and asks for confirmation — three separate hurdles before real money moves.'],
            ['Pinned account', 'The one brokerage account the agent is allowed to touch. Everything else is off-limits.'],
            ['Auto take-profit', 'When enabled, if price hits the target the service takes profit and re-arms the stop if price falls back; when off, you just get a notification.'],
            ['Exposure caps', 'A per-position dollar cap and a total-exposure cap. Proposals that would breach them are blocked before you ever see an order.'],
            ['Connection watchdog', 'The broker link is checked on a schedule with a real round trip, not a presence check, and a broken connection raises an alert instead of failing silently at the open.'],
          ]}
        />
      </DocSection>

      <DocSection title="When things run">
        <Bullets
          items={[
            <><Em>Pre-open (weekday mornings)</Em> — the agent screens its universe and posts proposals; the Agents tab shows an amber count badge when any are pending.</>,
            <><Em>Every 30 minutes during market hours</Em> — order statuses are polled from the broker.</>,
            <><Em>Sundays</Em> — the screening universe refreshes.</>,
            <><Em>Saturday mornings</Em> — the weekly performance review is written automatically.</>,
          ]}
        />
        <Warn>
          The whole system is fail-closed by design: disarmed by default, paper by default, a stop required on every
          proposal, caps enforced before the trade rather than after, and every action written to the Audit trail.
        </Warn>
      </DocSection>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Performance Review module
// ---------------------------------------------------------------------------

export function ReviewArticle() {
  return (
    <div className="space-y-8">
      <div className="flex items-center gap-2">
        <OwnerBadge />
      </div>
      <P>
        The Review module (Agents → section 4) grades your <Em>discretionary</Em> trading and the <Em>agent’s</Em>{' '}
        trading on the same scorecard, so “would the system trade better than me?” stops being a vibe and becomes a
        number. Design principle: <Em>code computes, the AI narrates</Em> — every statistic is deterministic
        arithmetic; the language model only writes the weekly commentary.
      </P>
      <div>
        <FeatureLink subtab="agents">Open Agents → Review</FeatureLink>
      </div>

      <DocSection title="The scorecard">
        <Figure caption="The scorecard: four KPIs and the R-multiple distribution.">
          <ScorecardFigure />
        </Figure>
        <Bullets
          items={[
            <><Em>Win rate</Em> (with the W/L count), <Em>Payoff ratio</Em> (average win ÷ average loss), <Em>Expectancy</Em> (average P&amp;L per round trip), and <Em>Net P/L</Em> (gross minus fees).</>,
            <><Em>R-multiple distribution</Em> — every round trip expressed as a multiple of your risk unit, bucketed into a histogram. A healthy chart clusters small red bars left of zero and taller green bars to the right.</>,
            <><Em>Manual vs. agentic</Em> — the same metrics side by side for your thinkorswim account and the agent’s account, with a <UI>Sync agentic fills</UI> button to pull the latest agent trades.</>,
            <><Em>Per-symbol table</Em> — trips, W-L, net P/L, fees, and <Em>max churn</Em> (round trips in one symbol in one session; highlighted amber past the threshold — the overtrading tell).</>,
            <><Em>Round trips table</Em> — every paired trade with its entry→exit, net P/L, and R value. Open positions are excluded and the count of exclusions is shown.</>,
          ]}
        />
      </DocSection>

      <DocSection title="Importing statements into Review">
        <Steps>
          <Step title="Export from thinkorswim">
            <UI>Monitor</UI> → <UI>Account Statement</UI> → export CSV (same file as the Journal import).
          </Step>
          <Step title="Import in the Review section">
            Click <UI>Choose statement CSV…</UI> under the Import heading.
          </Step>
          <Step title="Check the import history">
            Each batch is listed with a status pill and its contents — fill count, duplicates skipped, order rows, and
            sessions covered.
          </Step>
        </Steps>
        <Note>
          Re-importing the same file is a no-op (files are hash-deduplicated), and a parse failure rejects the whole
          file — there are never partial imports here.
        </Note>
      </DocSection>

      <DocSection title="Violations">
        <P>
          The Violations section applies one rulebook to both accounts — but differently: on your{' '}
          <Em>manual</Em> account, violations are <Em>observed</Em> after import (nothing blocks your live trading); on
          the <Em>agentic</Em> account the same rules are <Em>enforced before the trade happens</Em>. Each violation
          shows its severity, rule, account, date, and detail. A clean sheet reads “No violations recorded.”
        </P>
      </DocSection>

      <DocSection title="Weekly reviews">
        <P>
          Every Saturday morning a review of the week is written automatically: the violation count, one summary line
          per account (win rate · payoff · worst R), and a narrative of what actually happened. Click{' '}
          <UI>Run now</UI> to generate one on demand.
        </P>
      </DocSection>

      <DocSection title="Risk config">
        <RefTable
          rows={[
            ['Risk unit ($)', 'Your 1R — the dollar size of a normal stop-out. All R-multiples are computed against this.'],
            ['Max R multiple', 'The largest loss (in R) a proposal’s stop may imply before approval is refused.'],
            ['Churn threshold', 'Max round trips per symbol per session before the per-symbol table flags churn.'],
            ['Probation window', 'How many sessions of history the review considers when judging rule adherence.'],
            ['Breadth cap', 'Maximum number of distinct symbols in play.'],
          ]}
        />
        <P>
          Changes are append-only — the history of every config change is kept — and saving recomputes all R-multiples
          and violations against the new values.
        </P>
        <Tip>
          Set the risk unit to your <Em>actual</Em> modal stop-out size, not an aspirational one; the R histogram is
          only as honest as the R.
        </Tip>
      </DocSection>
    </div>
  );
}

// ---------------------------------------------------------------------------
// FAQ & troubleshooting
// ---------------------------------------------------------------------------

export function FaqArticle() {
  const faqs: [string, ReactNode][] = [
    [
      'Can I connect my brokerage account directly?',
      <>Yes, on Gold and up — link it once via <DocLink doc="brokerage-sync">Brokerage Sync (SnapTrade)</DocLink> and trades flow in on their own; while it&apos;s linked, the broker is the sole source of your Journal and equity curve. Prefer files instead? Export your Account Statement CSV from thinkorswim or Schwab and drop it into the <DocLink doc="importing">Import dialog</DocLink>. Either way the app never stores broker credentials and never places orders on your discretionary account.</>,
    ],
    [
      'My Excel file won’t import.',
      <>By design — imports accept CSV (or TXT) only. In Excel: <Em>File → Save As → CSV (Comma delimited)</Em>, then import the CSV. The error message in the dialog links the same fix.</>,
    ],
    [
      'Some rows failed to import. Did I lose them?',
      <>No — the rest of the file imported. The result panel lists the failing rows with a “How to fix it” hint (usually a malformed date or price). Fix those lines in the CSV and re-import; re-importing is safe because imported trades are replaced per date, never duplicated.</>,
    ],
    [
      'Does re-importing the same statement double my trades?',
      <>No. Journal imports replace imported trades date-by-date, and Review imports hash the file and skip exact duplicates.</>,
    ],
    [
      'Are options trades supported?',
      <>Treat the platform as equities-first. Options fills in a statement aren’t multiplied by the 100-share contract multiplier, so their P&amp;L would import wrong — track options manually or keep them out of the imported statement’s date range.</>,
    ],
    [
      'Why doesn’t my NLV match my broker app exactly?',
      <>Broker fees (borrow fees, commissions, regulatory charges) are tracked as their own metric rather than inside each trade’s P&amp;L, which can create a small, visible gap. Hover the <Em>ⓘ</Em> on the Performance NLV for the explanation with your numbers.</>,
    ],
    [
      'Where did my journal entry go? I saved it blank.',
      <>Blank journals can’t be saved — the three main prompts are required, and the server rejects empty entries too. Write at least a sentence per prompt; <Em>Other</Em> is the only optional field.</>,
    ],
    [
      'A section this guide describes isn’t in my tab bar. Why?',
      <>It belongs to a higher plan. Sections outside your plan aren’t rendered at all — there are no locked or teased panels. Free Silver covers the Journal, imports, Trade Management, Performance, Profit Projection, Market News and these docs; Gold adds brokerage sync, the full Market tab, AI insights and Goals; Platinum adds Portfolio and Agents. Your current tier is on your profile under <Em>Plan</Em>, and every account gets one free week of Gold — see <DocLink doc="plans">Plans &amp; Your Account</DocLink>.</>,
    ],
    [
      'What happens to my data if I cancel or my trial ends?',
      <>Nothing is deleted. The account degrades to free Silver, any linked brokerage is disconnected immediately, and paid features stop — but your trades, journal entries, goals and past AI reports all stay exactly where they are, and statement imports keep working. Re-upgrading picks up where you left off.</>,
    ],
    [
      'Why is one calendar day orange with no P&L?',
      <>Your broker hasn’t finished reporting that day yet. Rather than show a half-reported number as if it were final, the day gets an inert orange chart icon — trade count only, no P&amp;L, and it doesn’t open. It becomes a normal green or red day on the next sync after the broker marks it complete. See <DocLink doc="brokerage-sync">Brokerage Sync</DocLink>.</>,
    ],
    [
      'The Generate button says I hit a daily limit.',
      <>AI report generation is capped per account per day — two for Journal Insights, one for the weekly Portfolio review. Reports you already generated stay readable and downloadable; only new generations are paused, and the counter resets the next day. Scheduled reports don’t use your allowance.</>,
    ],
    [
      'What’s the difference between the Portfolio tab and the Trading tab?',
      <>Two separate brokerage accounts, kept deliberately apart. Trading is your active book — the journal, P&amp;L calendar and performance stats. <DocLink doc="portfolio">Portfolio</DocLink> is a long-term, buy-and-hold account with its own connection, and nothing in it ever reaches your trade list or equity curve. Mixing them would distort every trading statistic you have.</>,
    ],
    [
      'How do I restart the guided tour?',
      <>Click the orange <Em>?</Em> at the right end of the Trading sub-tab bar (on mobile: the section dropdown → <Em>Tutorial — Take the Tour</Em>).</>,
    ],
    [
      'Can I get my data out?',
      <>Yes — <Em>Export CSV</Em> in the All Trades panel downloads your full trade history, Daily Favorites exports from its panel header, gap-scanner results export from the scanner, and Journal Insights reports download as PDFs.</>,
    ],
    [
      'Does the app work on my phone?',
      <>Yes. The layout is responsive throughout — on small screens the Trading sections become a dropdown menu, the calendar stats become a card, and tables reflow. Everything documented here works on mobile.</>,
    ],
  ];

  return (
    <div className="space-y-8">
      <P>
        Quick answers to the questions that come up most. If something here contradicts what you see on screen, trust
        the screen — and check the relevant guide for the full story.
      </P>
      <div className="space-y-3">
        {faqs.map(([q, a]) => (
          <div key={q} className="rounded-xl px-4 py-3.5 space-y-1.5" style={{ background: 'var(--surface-1)', border: '1px solid var(--border-default)' }}>
            <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
              {q}
            </div>
            <div className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
              {a}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
