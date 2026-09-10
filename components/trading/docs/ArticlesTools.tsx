'use client';

import { DocSection, P, Em, Bullets, Steps, Step, Tip, Note, UI, TierBadge, FeatureLink, DocLink, Figure, RefTable, Kbd } from './DocsPrimitives';
import { PositionCalculatorFigure, WatchlistFlowFigure, GapScannerFigure, ProjectionFigure, IntradayAlertsFigure } from './DocsFigures';

// ---------------------------------------------------------------------------
// Trade Management
// ---------------------------------------------------------------------------

export function TradeManagementArticle() {
  return (
    <div className="space-y-8">
      <P>
        Trade Management is your live cockpit: a daily watchlist, a position-size calculator, and a three-stage trade
        workflow that carries an idea from <Em>planned</Em> to <Em>active</Em> to <Em>closed</Em> — and finally into
        your journal calendar.
      </P>
      <div>
        <FeatureLink subtab="trade-management">Open Trade Management</FeatureLink>
      </div>

      <DocSection title="The trade lifecycle">
        <Figure caption="The workflow: plan trades in Potential, promote them to Active when you enter, close them when you exit, then transfer closed positions onto the journal calendar.">
          <WatchlistFlowFigure />
        </Figure>
      </DocSection>

      <DocSection title="Daily Favorites">
        <P>
          The top-left panel is your shortlist for the day. It seeds itself each pre-market morning and clears after the
          close, so it always reflects <Em>today</Em>.
        </P>
        <Bullets
          items={[
            <>
              <Em>Add tickers</Em> one at a time (type a symbol, press <Kbd>Enter</Kbd> or click <UI>Add</UI>) or in
              bulk — paste a list like <UI>AAPL TSLA NVDA</UI> (spaces or new lines both work).
            </>,
            <>
              <Em>Star tickers from the Gap Scanner</Em> on the Market tab to send them here with one click — see{' '}
              <DocLink doc="market">Market Tools</DocLink>.
            </>,
            <>
              <Em>Click any ticker</Em> to load it straight into the Position Calculator below.
            </>,
            <>
              Search, sort by ticker or pre-market change, <Em>copy the list to your clipboard</Em>, or{' '}
              <Em>export it to CSV</Em> from the panel header.
            </>,
            <>
              The <Em>bell</Em> in the panel header is <Em>Intraday Alerts</Em> — see the section below.
            </>,
          ]}
        />
      </DocSection>

      <DocSection title="Position Calculator">
        <Figure caption="Enter risk, entry, stop, and target — get stop size, share count, R:R, potential profit, and total position size.">
          <PositionCalculatorFigure />
        </Figure>
        <Steps>
          <Step title="Set your risk">
            Enter the dollar amount you’re willing to lose on the trade in <UI>Risk ($)</UI>. It’s remembered between
            sessions.
          </Step>
          <Step title="Pick a minimum reward-to-risk">
            Choose <UI>Min R:R</UI> — 1.5:1, 2:1, 2.5:1, 3:1, or 4:1.
          </Step>
          <Step title="Enter your levels">
            Fill in <UI>Entry</UI> and <UI>Stop</UI>. Set <UI>Target</UI> yourself, or click the auto-calc button to
            place it at Entry + (Stop Size × R:R).
          </Step>
          <Step title="Read the outputs">
            <Em>Stop Size</Em> (entry − stop), <Em>Shares</Em> (risk ÷ stop size), <Em>R:R</Em>, <Em>Profit</Em> at
            target, and total <Em>Position</Em> size. The target also carries the <Em>percentage move from entry</Em>{' '}
            in a pill beside the price — a fast sanity check that you aren&apos;t asking a slow name for an 18% day.
            Hover any tile to see the arithmetic behind it.
          </Step>
        </Steps>
        <Tip>
          Sizing from risk (not from share count) is the whole point: pick the dollar loss you can accept, and the
          calculator tells you how many shares that allows at your stop distance.
        </Tip>
      </DocSection>

      <DocSection title="Intraday Alerts">
        <Figure caption="The Intraday Alerts modal: the strongest movers of the last scan, ranked, each one addable to Daily Favorites.">
          <IntradayAlertsFigure />
        </Figure>
        <P>
          The gap scanner tells you what moved before the open. Intraday Alerts is the same idea <Em>during</Em> the
          session: a market-wide scan runs every 30 minutes through the trading day and surfaces the names moving with
          real conviction. The bell in the Daily Favorites header glows — and chimes once — when a scan turns up
          tickers you haven&apos;t seen yet.
        </P>
        <Bullets
          items={[
            <>
              <Em>What qualifies</Em> — a name has to clear hard floors on today&apos;s session volume (1.5M shares),
              market cap ($50M), price, day range, and bid-ask spread before it&apos;s even considered. Survivors are
              then ranked, and only the top ten are shown.
            </>,
            <>
              <Em>How they&apos;re ranked</Em> — the <Em>Score</Em> column blends the size of the move (50%), relative
              volume against the 90-day average (30%), and spread tightness (20%). Relative volume is deliberately
              weighted over raw share count: conviction, not just activity.
            </>,
            <>
              <Em>The columns</Em> — <UI>TF</UI> is the lookback window the move was measured over, then{' '}
              <UI>Move</UI>, <UI>Price</UI>, <UI>Spread</UI>, <UI>Volume</UI>, <UI>RVOL</UI>, and <UI>Score</UI>.
            </>,
            <>
              <Em>Add to Daily Favorites</Em> right from the row — same one-click pipeline as starring a gap-scanner
              result.
            </>,
            <>
              <Em>Mute</Em> the chime with the speaker icon in the modal header. The visual glow stays either way.
            </>,
          ]}
        />
        <Note>
          A ticker you&apos;ve already looked at won&apos;t alert you again for the rest of that trading day — opening
          the modal marks everything in it as viewed, so later scans only surface genuinely new names. That&apos;s why
          the modal can read &ldquo;all caught up&rdquo; while the scan itself found plenty.
        </Note>
      </DocSection>

      <DocSection title="The Watchlist: Potential → Active → Closed">
        <P>
          The right-hand column holds three collapsible sections. Collapse states are remembered between visits, and
          each section carries <Em>its own</Em> ticker search — scoped to that section rather than filtering the whole
          column, so searching Active Trades never hides a potential setup you were comparing it against. Rows can be
          dragged to reorder; on a touch screen, press and hold a row for a moment first to pick it up.
        </P>
        <RefTable
          rows={[
            [
              'Potential Trades',
              <>
                Ideas you’ve planned but not entered, split into <Em>Favorites</Em> and <Em>Other Trades</Em>. Each row
                stores your planned entry, stop, target, R:R, and share size (edit anytime with the pencil). When you
                take the trade, click <Em>Enter position</Em> and record your actual entry price, share count, and any
                notes — the row moves to Active Trades.
              </>,
            ],
            [
              'Active Trades',
              <>
                Positions you’re currently in. Search them, edit details, and jot notes inline while the trade is on.
                When you exit, click <Em>Close trade</Em> to record the exit. Changed your mind before entry was real?
                Drag a row back to Potential Trades (or use <Em>Move selected back</Em>).
              </>,
            ],
            [
              'Closed Positions',
              <>
                Finished trades waiting to be filed. Select one or more and use the <Em>transfer to calendar</Em> action
                to write them into the journal calendar under the date you choose — they then appear in the day’s
                P&amp;L, the All Trades list, and Performance.
              </>,
            ],
          ]}
        />
        <Note>
          Transferring a closed position to the calendar is what promotes it from “watchlist scratchpad” to “trading
          record.” Statement imports are the other way trades reach the record — use whichever fits your workflow, or
          both.
        </Note>
      </DocSection>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Market tools
// ---------------------------------------------------------------------------

export function MarketArticle() {
  return (
    <div className="space-y-8">
      <div className="flex items-center gap-2">
        <TierBadge tier="gold" />
      </div>
      <P>
        The Market tab is your pre-market and intraday context: what’s moving, what’s on the calendar, and an
        AI-written morning briefing. Market News is its sibling tab for headline flow and is available on every plan,
        including free Silver.
      </P>
      <div className="flex gap-2 flex-wrap">
        <FeatureLink subtab="market">Open Market</FeatureLink>
        <FeatureLink subtab="market-news">Open Market News</FeatureLink>
      </div>

      <DocSection title="Market events and the morning briefing">
        <P>
          The events strip flags what can move the tape today — <UI>FOMC</UI>, <UI>Earnings</UI>, and <UI>Gov</UI>{' '}
          chips. Next to it, the bell opens the <Em>Market Briefing</Em>: an AI-generated morning read on futures,
          catalysts, and the day’s setup, written fresh every weekday morning. A dot on the bell means there’s a
          briefing you haven’t read.
        </P>
        <P>
          The briefing opens with the day&apos;s motivational quote, then the read itself.
        </P>
        <Tip>
          Want it in your inbox instead? Turn on the Market Briefing email in your profile (avatar → Email
          Notifications).
        </Tip>
      </DocSection>

      <DocSection title="The Gap Scanner">
        <Figure caption="The gap scanner: session pill, live rows, and a star to send a ticker to Daily Favorites.">
          <GapScannerFigure />
        </Figure>
        <P>
          A live scanner for the day’s biggest movers. The session pill shows what it’s scanning for — Pre-Market,
          Market Open, After Hours, or Market Closed — and results auto-refresh every two minutes during market hours.
        </P>
        <Bullets
          items={[
            <>
              <Em>Filters</Em> — click the configure button to set minimum gap %, minimum volume (default 5M shares),
              minimum market cap, a price range, and maximum spread %. There’s also a <Em>gap vs. intraday</Em> mode
              toggle with an adjustable rolling window.
            </>,
            <>
              <Em>Star a row</Em> to add that ticker to Daily Favorites on{' '}
              <DocLink doc="trade-management">Trade Management</DocLink> — your scan-to-plan pipeline.
            </>,
            <>
              <Em>Export</Em> results to CSV, or open the full-list view for everything past the visible rows.
            </>,
            <>
              The criteria popover (the <UI>ⓘ</UI> next to the filters) explains exactly what each filter does.
            </>,
          ]}
        />
      </DocSection>

      <DocSection title="Market News">
        <P>
          A filtered headline screener. Use the category chips — <UI>High Priority</UI>, <UI>Fed</UI>, <UI>Macro</UI>,{' '}
          <UI>M&amp;A</UI>, <UI>Earnings</UI>, <UI>AI</UI>, <UI>Crypto</UI> — to narrow the feed. Every headline carries
          a sentiment badge (<Em>Bullish</Em> / <Em>Bearish</Em> / <Em>Neutral</Em>) and links to the source.
        </P>
      </DocSection>

      <DocSection title="The two daily emails">
        <P>
          Both are opt-in per account and toggled independently from your profile (avatar → <Em>Email
          Notifications</Em>). They&apos;re part of Gold and up.
        </P>
        <RefTable
          headers={['Email', 'When it lands']}
          rows={[
            [
              'Morning Market Briefing',
              <>Weekday mornings at <Em>8 AM ET</Em>, before the open — the same AI briefing the bell opens in-app, delivered to your inbox.</>,
            ],
            [
              'Daily Market Recap',
              <>Weekdays at <Em>5 PM ET</Em>, after the close — an AI wrap-up of the session: the day&apos;s movers, the macro that mattered, and earnings.</>,
            ],
          ]}
        />
        <Note>
          Turning a toggle off stops that email only; nothing else about your account changes, and the in-app briefing
          stays available either way.
        </Note>
      </DocSection>

      <DocSection title="Alerts during the session">
        <P>
          The gap scanner covers the pre-market picture. For movers <Em>during</Em> the session, the alert bell on
          Daily Favorites runs a market-wide scan every 30 minutes and surfaces the strongest names — see{' '}
          <DocLink doc="trade-management">Intraday Alerts</DocLink>.
        </P>
      </DocSection>

      <DocSection title="The 9:15 rules check">
        <P>
          On trading mornings at 9:15 AM ET, a short <Em>Trading Rules</Em> acknowledgement pops up before the open — a
          deliberate speed bump to re-read your own rules before the bell. Acknowledge it and it’s gone for the day.
        </P>
      </DocSection>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Profit projection
// ---------------------------------------------------------------------------

export function ProjectionArticle() {
  return (
    <div className="space-y-8">
      <P>
        Profit Projection answers one question: <Em>if my stats hold, what does that compound to?</Em> Enter four
        numbers and it projects your expectancy across trading-day horizons.
      </P>
      <div>
        <FeatureLink subtab="projection">Open Profit Projection</FeatureLink>
      </div>

      <DocSection title="How it works">
        <Figure caption="Sample projection: 3 trades/day, $50 risk, 2:1 reward-to-risk, 45% win rate.">
          <ProjectionFigure />
        </Figure>
        <P>
          The inputs are <UI>Trades / Day</UI>, <UI>Risk / Trade ($)</UI>, <UI>Reward : Risk</UI>, and{' '}
          <UI>Win Rate (%)</UI>. Each trade’s expected value is{' '}
          <Em>(win rate × reward) − (loss rate × risk)</Em>; the tiles multiply that by your trade count over 1 trading
          day, 5 (a week), 21 (a month), and 252 (a year).
        </P>
        <Bullets
          items={[
            <>
              Pull <Em>real</Em> numbers from your <DocLink doc="performance">Performance</DocLink> tab — win rate and
              average win/loss are right on the equity-curve card — rather than guessing.
            </>,
            <>
              Use it to sanity-check goals: if the yearly tile can’t reach your{' '}
              <DocLink doc="goals">net-profit goal</DocLink>, either the goal or the stats need to change.
            </>,
            <>
              Small edges compound — try nudging win rate by 5 points or R:R by half a point and watch the yearly
              number.
            </>,
          ]}
        />
        <Note>
          It’s a projection, not a promise: it assumes your inputs stay constant and every day is average. Real trading
          is streaky — that’s what <Em>Max Drawdown</Em> and streak stats on Performance are for.
        </Note>
      </DocSection>
    </div>
  );
}
