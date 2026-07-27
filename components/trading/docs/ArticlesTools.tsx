'use client';

import { DocSection, P, Em, Bullets, Steps, Step, Tip, Note, UI, FeatureLink, DocLink, Figure, RefTable, Kbd } from './DocsPrimitives';
import { PositionCalculatorFigure, WatchlistFlowFigure, GapScannerFigure, ProjectionFigure } from './DocsFigures';

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
            target, and total <Em>Position</Em> size. Hover any tile to see the arithmetic behind it.
          </Step>
        </Steps>
        <Tip>
          Sizing from risk (not from share count) is the whole point: pick the dollar loss you can accept, and the
          calculator tells you how many shares that allows at your stop distance.
        </Tip>
      </DocSection>

      <DocSection title="The Watchlist: Potential → Active → Closed">
        <P>
          The right-hand column holds three collapsible sections. Collapse states are remembered between visits.
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

      <DocSection title="Trading Mode (fullscreen)">
        <P>
          Click <UI>Trading Mode</UI> (top right) to go fullscreen for the session: your active trades in a strip across
          the top and a four-column watchlist below — nothing else. Press <Kbd>Esc</Kbd> or click <UI>Exit</UI> to
          leave.
        </P>
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
      <P>
        The Market tab is your pre-market and intraday context: what’s moving, what’s on the calendar, and an
        AI-written morning briefing. Market News is its sibling tab for headline flow.
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
