'use client';

import { DocSection, P, Em, Bullets, Steps, Step, Tip, Note, UI, FeatureLink, DocLink, Figure, RefTable } from './DocsPrimitives';
import { EquityCurveFigure, MetricCardsFigure, GoalCardFigure } from './DocsFigures';

// ---------------------------------------------------------------------------
// Performance & analytics
// ---------------------------------------------------------------------------

export function PerformanceArticle() {
  return (
    <div className="space-y-8">
      <P>
        The Performance tab turns your trade history into an honest scoreboard: an equity curve anchored to your real
        broker balances, the core statistics every trader should track, and an AI review of your own journal. Everything
        here updates automatically when you import a statement or close a trade.
      </P>
      <div>
        <FeatureLink subtab="performance">Open Performance</FeatureLink>
      </div>

      <DocSection title="Choosing a period">
        <P>
          The selector at the top switches every card between <UI>Past Week</UI>, <UI>Past Month</UI>,{' '}
          <UI>Past Year</UI>, and <UI>All Time</UI>.
        </P>
      </DocSection>

      <DocSection title="The equity curve">
        <Figure caption="The equity curve card: NLV headline, total P&L, the curve itself, and the four core stats.">
          <EquityCurveFigure />
        </Figure>
        <P>
          The big number is your <Em>Net Liquidating Value</Em> (NLV) — account value if everything were closed right
          now. When you’ve imported thinkorswim Account Statements, the curve uses your broker’s actual end-of-day
          balances; otherwise it derives from your starting balance plus cumulative P&amp;L.
        </P>
        <Steps>
          <Step title="Set your starting balance">
            Click <UI>Set Starting Balance</UI> on the card and enter what the account started with. Once set, it shows
            as <Em>Starting: $…</Em> — hover it and click the pencil to change it later.
          </Step>
          <Step title="Import statements regularly">
            Each import adds broker-authoritative daily balances, so the curve tracks reality — including deposits,
            withdrawals, and fees. See <DocLink doc="importing">Importing Trades &amp; Broker Data</DocLink>.
          </Step>
        </Steps>
        <Note>
          If the NLV differs slightly from your broker app, hover the <UI>ⓘ</UI> next to it — broker fees are tracked
          separately (see below), which can create small, explained gaps.
        </Note>
      </DocSection>

      <DocSection title="Metrics glossary">
        <Figure caption="The headline metric cards.">
          <MetricCardsFigure />
        </Figure>
        <P>
          Every metric label on the tab has its own <UI>ⓘ</UI> tooltip in-app; here’s the full glossary in one place.
        </P>
        <RefTable
          headers={['Metric', 'What it means']}
          rows={[
            ['Net Profit', 'Total P&L across all closed trades in the period, after fees recorded on each trade.'],
            ['Win Rate', 'Winning trades ÷ total closed trades. Meaningless alone — pair it with payoff size.'],
            ['Profit Factor', 'Gross profit ÷ gross loss. Above 1.0 you make more than you lose; 1.5–2.0 is strong.'],
            ['Avg Win / Avg Loss', 'Average P&L of winning trades vs. losing trades. Keeping the ratio above 1 lets modest win rates be profitable.'],
            ['Max Drawdown', 'The largest peak-to-trough drop of your cumulative P&L — the worst losing stretch you sat through, in dollars and percent.'],
            ['Best Streak', 'Longest run of consecutive winning trades (the card also shows your current streak, e.g. 3W or 2L).'],
            ['Largest Win / Loss', 'Your single best and worst closed trades — outsized losses here usually mean a risk-control leak.'],
            ['Breakeven Trades', 'Closed trades that finished at exactly zero P&L.'],
            ['Broker Fees', 'Stock-borrow fees, commissions, and regulatory charges pulled from imported statements. This card appears once fee data exists.'],
          ]}
        />
        <P>
          Below the cards, the <Em>Detailed Statistics</Em> table breaks out totals (winning/losing/breakeven counts,
          gross profit and loss, averages, and streaks), and the <Em>Day of Week</Em> chart shows your P&amp;L by
          weekday — with trade count and win rate in the hover tooltip. Many traders discover one weekday quietly
          bleeding money.
        </P>
      </DocSection>

      <DocSection title="AI Journal Insights">
        <P>
          Journal Insights reads your <DocLink doc="journal">daily journal entries</DocLink> together with your trading
          results and writes a coaching report: a <Em>Key Takeaway</Em>, your <Em>Strengths</Em>,{' '}
          <Em>Improvements</Em>, and recurring <Em>Patterns</Em> it noticed.
        </P>
        <Steps>
          <Step title="Pick a window">
            Toggle <UI>This Week</UI> or <UI>This Month</UI>.
          </Step>
          <Step title="Generate">
            Click <UI>Generate Report</UI>. When it finishes, click the report tile to open the full write-up.
          </Step>
          <Step title="Keep or export">
            Reports are archived — revisit them from the <UI>Past Reports</UI> dropdown, regenerate anytime, or{' '}
            <UI>Download PDF</UI> for a copy outside the app.
          </Step>
        </Steps>
        <Tip>
          The more consistently you journal, the sharper the insights get — three required prompts a day is all it
          takes.
        </Tip>
      </DocSection>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Trading goals
// ---------------------------------------------------------------------------

export function GoalsArticle() {
  return (
    <div className="space-y-8">
      <P>
        Trading Goals are <Em>self-tracking</Em>: you define a target like “earn $1,050 by July 31” or a guardrail like
        “never lose more than $300 in a day,” and the app measures it continuously from your actual trade history. No
        check-ins, no manual progress updates — the trades are the truth.
      </P>
      <div>
        <FeatureLink subtab="goals">Open Goals</FeatureLink>
      </div>

      <DocSection title="Creating a goal">
        <Steps>
          <Step title="Click New Goal" />
          <Step title="Pick a category and metric">
            Categories group the eleven metrics (table below). The metric decides what gets measured; its example
            placeholder shows a sensible target.
          </Step>
          <Step title="Set the target and window">
            Enter the <UI>Target</UI> (or <UI>Limit</UI>, for guardrail-style metrics) and the <UI>Start</UI> and{' '}
            <UI>End</UI> dates. Windows count <Em>trading days</Em> — weekends and market holidays are excluded
            automatically.
          </Step>
          <Step title="Optionally attach a guardrail">
            Tick the guardrail checkbox to pair the goal with a protective limit — e.g. a profit target that only
            counts as clean if max daily loss stayed under $300. Guardrails render as shield chips on the goal card.
          </Step>
          <Step title="Name it and save">
            Give it a title, add optional notes, and save. Progress starts computing immediately.
          </Step>
        </Steps>
      </DocSection>

      <DocSection title="Reading a goal card">
        <Figure caption="A paced net-profit goal: progress bar, the three pace tiles, days remaining, and a guardrail chip.">
          <GoalCardFigure />
        </Figure>
        <Bullets
          items={[
            <>
              The <Em>status pill</Em> summarizes where you stand: <Em>On track</Em>, <Em>Ahead of pace</Em>,{' '}
              <Em>Behind pace</Em>, <Em>Achieved</Em>, or <Em>Missed</Em>. For limit-style goals the wording flips —{' '}
              <Em>Within limit</Em>, <Em>Held</Em>, or <Em>Breached</Em>. <Em>No data yet</Em> means no qualifying
              trades in the window so far.
            </>,
            <>
              <Em>Paced metrics</Em> (net profit, green days) show three tiles inside an open window:{' '}
              <Em>Pace needed</Em> (what’s required per remaining trading day), <Em>Your pace</Em> (actual rate so
              far), and <Em>Projected</Em> (where your pace lands by the end date).
            </>,
            <>
              The footer shows the <Em>sample size</Em> behind the number — “12 trades,” “9 trading days,” “7 rated
              trades” — so you know how much evidence is in the reading.
            </>,
            <>
              <Em>Edit</Em>, <Em>Archive</Em>, or <Em>Delete</Em> from the icons on each card. Archived goals tuck away
              behind a <UI>Show archived</UI> toggle.
            </>,
          ]}
        />
      </DocSection>

      <DocSection title="The eleven metrics">
        <RefTable
          headers={['Metric', 'What it tracks']}
          rows={[
            [<Em key="1">Profitability</Em>, ''],
            ['Net profit ($, ≥)', 'Total realized P&L in the window. Paced — you get pace tiles and a projection.'],
            [<Em key="2">Consistency</Em>, ''],
            ['Win rate (%, ≥)', 'Winning trades as a share of closed trades in the window.'],
            ['Profit factor (≥)', 'Gross profit ÷ gross loss in the window.'],
            ['Green days (count, ≥)', 'Number of profitable trading days. Paced.'],
            ['Max drawdown ($, ≤)', 'Worst peak-to-trough drop of cumulative P&L in the window — keep it under your limit.'],
            [<Em key="3">Guardrails</Em>, ''],
            ['Max daily loss ($, ≤)', 'Your worst single losing day must stay under the limit.'],
            ['Max single-trade loss ($, ≤)', 'Your worst individual trade must stay under the limit.'],
            ['Max trades per day (count, ≤)', 'Your busiest day must stay under the limit — an overtrading brake.'],
            [<Em key="4">Journaling &amp; discipline</Em>, ''],
            ['A+ setups (%, ≥)', 'Share of rated trades marked excellent-quality setups. Needs setup-quality ratings on your trades to have data.'],
            ['Plan adherence (%, ≥)', 'Share of marked trades where “Followed my plan?” is yes — set it when editing each trade.'],
            ['Journaling consistency (%, ≥)', 'Share of trading days with a saved journal entry.'],
          ]}
        />
        <Note>
          Realized P&amp;L is attributed to a trade’s <Em>exit date</Em>, and all windows use US-market trading days in
          Eastern time. Goals recompute from history on every view — editing or importing past trades updates them
          retroactively.
        </Note>
        <Tip>
          A good starter set: one monthly <Em>net profit</Em> target, one <Em>max daily loss</Em> guardrail, and one{' '}
          <Em>journaling consistency</Em> goal at 100%. Outcome, protection, and process — one goal each.
        </Tip>
      </DocSection>
    </div>
  );
}
