'use client';

import { ReactNode } from 'react';
import { DocSection, P, Em, Bullets, Steps, Step, Tip, Note, Warn, UI, OwnerBadge, FeatureLink, DocLink, Figure, RefTable, Kbd } from './DocsPrimitives';
import { ProposalCardFigure, ScorecardFigure } from './DocsFigures';

// ---------------------------------------------------------------------------
// Agents (agentic trading terminal)
// ---------------------------------------------------------------------------

export function AgentsArticle() {
  return (
    <div className="space-y-8">
      <div className="flex items-center gap-2">
        <OwnerBadge />
      </div>
      <P>
        The Agents tab is ConfluenceTrading’s agentic swing-trading terminal. Its operating principle is printed right
        in the header: <Em>Agent proposes · you approve · service executes.</Em> An AI agent screens the market each
        pre-open and writes trade proposals; nothing is ever bought or sold without your explicit approval, and the
        whole system ships <Em>disarmed</Em> and in <Em>paper mode</Em> until you deliberately turn those on.
      </P>
      <div>
        <FeatureLink subtab="agents">Open Agents</FeatureLink>
      </div>

      <DocSection title="Reading the header">
        <Bullets
          items={[
            <>
              <Em>BUYING POWER</Em> — the account’s available buying power. It turns red when pending proposals exceed
              it, and a banner explains which proposals are blocked.
            </>,
            <>
              A red <UI>Disarmed</UI> pill means the kill switch is engaged: approvals are recorded but no orders are
              placed.
            </>,
            <>
              The <UI>PAPER MODE</UI> / <UI>LIVE MODE</UI> pill shows which account the service is pointed at.
            </>,
            <>
              The <Em>run banner</Em> summarizes the last agent screen in plain English — how many symbols were
              screened, how many passed the value gate, and why zero proposals can be a feature (“the strategy being
              selective”). It warns in amber if the last run is more than 24 hours old.
            </>,
          ]}
        />
      </DocSection>

      <DocSection title="The seven sections">
        <P>
          The terminal has seven segmented sections — jump between them with keys <Kbd>1</Kbd>–<Kbd>7</Kbd>.
        </P>
        <RefTable
          rows={[
            ['1 · Proposals', 'Pending trade ideas awaiting your decision (details below).'],
            ['2 · Orders', 'Every order with lifecycle chips — Working, Filled, Cancelled — plus per-order Refresh (real broker poll) and Cancel. A side rail shows current positions and upcoming proposals.'],
            ['3 · Performance', 'Eight KPIs for the agentic account: account value, buying power, total and unrealized P&L, invested cost, open exposure vs. its cap, proposal counts, and filled orders — plus an account-value chart and open-positions table.'],
            [<span key="r">4 · Review</span>, <>The Performance Review module — a shared scorecard for your manual and agentic accounts. Full guide: <DocLink doc="review">Performance Review</DocLink>.</>],
            ['5 · Audit', 'An immutable event trail of everything that happened — every proposal event and order status change, stamped with who did it (agent, you, or the system).'],
            ['6 · Strategy', 'The active strategy (currently Value-TA Pullback) with a rules breakdown generated from the live strategy parameters — what you read is exactly what the code enforces.'],
            ['7 · Settings', 'Arming, paper/live, account pinning, auto take-profit, and exposure caps (details below).'],
          ]}
        />
      </DocSection>

      <DocSection title="Reviewing a proposal">
        <Figure caption="A proposal card: thesis, fundamentals, price levels — and the three decisions.">
          <ProposalCardFigure />
        </Figure>
        <Steps>
          <Step title="Read the thesis">
            Each card shows the symbol and direction, the agent’s reasoning, a fundamentals grid, a live quote line
            (advisory — the agent priced off the prior close), and the proposed stop and target.
          </Step>
          <Step title="Decide">
            <UI>Approve</UI> sends it to the execution service as-is. <UI>Reject</UI> declines it.{' '}
            <UI>Edit</UI> opens the limit price, quantity, stop, target, and time-in-force for adjustment — the button
            becomes <UI>Approve edited</UI>.
          </Step>
          <Step title="Watch it in Orders">
            Approved proposals become orders; follow their lifecycle in section 2. Once an entry fills (while armed),
            the service automatically places a GTC stop at your approved stop price.
          </Step>
        </Steps>
        <Note>
          Approval has hard safety rails: a proposal without a stop is refused, and the maximum loss implied by the
          stop must fit the risk budget configured in <DocLink doc="review">Review → Risk config</DocLink>. Oversized
          proposals are “sized out” and reported in the run banner.
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
          ]}
        />
      </DocSection>

      <DocSection title="When things run">
        <Bullets
          items={[
            <><Em>Pre-open (weekday mornings)</Em> — the agent screens its universe and posts proposals; the Agents tab shows an amber count badge when any are pending.</>,
            <><Em>Every 30 minutes during market hours</Em> — order statuses are polled from the broker.</>,
            <><Em>Sundays</Em> — the screening universe refreshes.</>,
            <><Em>Saturday mornings</Em> — the weekly Performance Review is written automatically (see <DocLink doc="review">Performance Review</DocLink>).</>,
          ]}
        />
        <Warn>
          Agentic trading is deliberately owner-only and fail-closed: disarmed by default, paper by default, stop
          required, caps enforced pre-trade, and every action logged in the Audit trail.
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
      <>Not currently — statement import is the supported path. Export your Account Statement CSV from thinkorswim or Schwab and drop it into the <DocLink doc="importing">Import dialog</DocLink>; one file updates trades, balances, and fees together. The app never stores broker credentials and never places orders on your discretionary account.</>,
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
      'Which parts of Trading are owner-only?',
      <>Just the <DocLink doc="agents">Agents</DocLink> tab (the agentic terminal, including <DocLink doc="review">Review</DocLink>) — it drives a real brokerage account, so it’s restricted to the app owner. Everything else — Journal, imports, Market, Trade Management, Goals, Performance, Profit Projection, and these docs — is available to every signed-in user, and each user’s data is fully private to their account.</>,
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
