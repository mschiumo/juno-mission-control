'use client';

import { DocSection, P, Em, Bullets, Steps, Step, Tip, Note, Warn, UI, OwnerBadge, FeatureLink, DocLink, Figure, RefTable } from './DocsPrimitives';
import { SubTabBarFigure, CalendarWeekFigure, JournalModalFigure, TradesTableFigure, ImportDropzoneFigure } from './DocsFigures';

// ---------------------------------------------------------------------------
// Getting started
// ---------------------------------------------------------------------------

export function GettingStartedArticle() {
  return (
    <div className="space-y-8">
      <P>
        Welcome to <Em>ConfluenceTrading</Em> — your trading command center. Everything lives in one place: a
        calendar-first journal, live market tools, trade planning and position sizing, auto-tracked goals, and a full
        performance suite. This guide walks the whole platform, feature by feature, with step-by-step tutorials. New
        here? Read this page, then follow the Quick Start at the bottom.
      </P>

      <DocSection title="The Trading tab at a glance">
        <Figure caption="The Trading sub-tab bar. Each section is one click away, and every section has its own bookmarkable URL.">
          <SubTabBarFigure />
        </Figure>
        <RefTable
          headers={['Section', 'What it does']}
          rows={[
            [
              <FeatureLink key="j">Journal</FeatureLink>,
              <>Your home base — a monthly calendar of trading days with per-day P&amp;L, daily journal entries, and the full trade list with import/export. See <DocLink doc="journal">The Trading Journal</DocLink>.</>,
            ],
            [
              <FeatureLink key="m" subtab="market">Market</FeatureLink>,
              <>Market events, the AI morning briefing, a live gap scanner, and an index/sector snapshot. See <DocLink doc="market">Market Tools</DocLink>.</>,
            ],
            [
              <FeatureLink key="n" subtab="market-news">Market News</FeatureLink>,
              <>A filtered news screener with sentiment badges — High Priority, Fed, Macro, M&amp;A, Earnings, AI, and Crypto categories.</>,
            ],
            [
              <FeatureLink key="t" subtab="trade-management">Trade Management</FeatureLink>,
              <>Daily favorites watchlist, position-size calculator, and the potential → active → closed trade workflow, plus a fullscreen Trading Mode. See <DocLink doc="trade-management">Trade Management</DocLink>.</>,
            ],
            [
              <FeatureLink key="g" subtab="goals">Goals</FeatureLink>,
              <>Profit targets, guardrails, and consistency goals — tracked automatically from your trade history. See <DocLink doc="goals">Trading Goals</DocLink>.</>,
            ],
            [
              <FeatureLink key="p" subtab="performance">Performance</FeatureLink>,
              <>Equity curve, win rate, profit factor, drawdown, streaks, broker fees, and AI journal insights. See <DocLink doc="performance">Performance &amp; Analytics</DocLink>.</>,
            ],
            [
              <FeatureLink key="pp" subtab="projection">Profit Projection</FeatureLink>,
              <>A quick expectancy calculator: what your stats compound to per day, week, month, and year. See <DocLink doc="projection">Profit Projection</DocLink>.</>,
            ],
            [
              <span key="a" className="inline-flex items-center gap-2 flex-wrap">
                <FeatureLink subtab="agents">Agents</FeatureLink>
                <OwnerBadge />
              </span>,
              <>The agentic swing-trading terminal — the agent proposes, you approve, the service executes. Includes the Performance Review module. See <DocLink doc="agents">Agents</DocLink>.</>,
            ],
          ]}
        />
      </DocSection>

      <DocSection title="Navigation and deep links">
        <P>
          The underline tab bar at the top (a dropdown on mobile) switches between the platform’s sections. Every
          section updates the URL — for example{' '}
          <UI>/?tab=trading&amp;subtab=performance</UI> — so you can bookmark a section, share a link, or use your
          browser’s back button freely. These docs are a section too: <UI>/?tab=trading&amp;subtab=docs</UI>, and each
          article has its own <UI>&amp;doc=</UI> link.
        </P>
      </DocSection>

      <DocSection title="The guided tour">
        <P>
          The first time you open the Trading tab, a 10-step interactive tour spotlights the essentials: importing from
          thinkorswim, the position calculator, Trading Mode, the daily market briefing, the gap scanner, the equity
          curve, AI journal insights, and profit projection. You can re-run it anytime — click the orange{' '}
          <UI>?</UI> button at the far right of the sub-tab bar (on mobile, open the section dropdown and tap{' '}
          <UI>Tutorial — Take the Tour</UI>).
        </P>
        <Tip>
          The tour is the fastest way to learn the layout; these docs are the reference for everything the tour
          doesn’t cover. Use both.
        </Tip>
      </DocSection>

      <DocSection title="Your profile and preferences">
        <P>
          Click your avatar in the header to open your profile. There you can edit your name and email, and toggle{' '}
          <Em>Email Notifications</Em> for the daily Market Briefing. Your equity-curve starting balance is set from the{' '}
          <DocLink doc="performance">Performance</DocLink> tab and stored with your preferences.
        </P>
      </DocSection>

      <DocSection title="Quick Start — your first week">
        <Steps>
          <Step title="Take the tour">
            Click the <UI>?</UI> button on the Trading tab and walk the 10 steps. Two minutes, well spent.
          </Step>
          <Step title="Import your trading history">
            Export an Account Statement from thinkorswim and drop it into the <UI>Import</UI> modal on the Journal tab.
            Trades, daily balances, and broker fees all flow in from one file. Full guide:{' '}
            <DocLink doc="importing">Importing Trades &amp; Broker Data</DocLink>.
          </Step>
          <Step title="Set your starting balance">
            On the <DocLink doc="performance">Performance</DocLink> tab, click <UI>Set Starting Balance</UI> so the
            equity curve shows real dollars, not just cumulative P&amp;L.
          </Step>
          <Step title="Journal today">
            Back on the Journal calendar, click today’s book icon and answer the three prompts. The calendar shows a
            blue check for every journaled day — keep the chain alive.
          </Step>
          <Step title="Set one goal">
            On <DocLink doc="goals">Goals</DocLink>, create a simple target — for example, a monthly net-profit goal
            with a max-daily-loss guardrail. It tracks itself from your imported trades.
          </Step>
          <Step title="Plan tomorrow in Trade Management">
            Star tickers from the gap scanner into Daily Favorites, size positions with the calculator, and stage
            entries in Potential Trades. See <DocLink doc="trade-management">Trade Management</DocLink>.
          </Step>
        </Steps>
      </DocSection>
    </div>
  );
}

// ---------------------------------------------------------------------------
// The Trading Journal
// ---------------------------------------------------------------------------

export function JournalArticle() {
  return (
    <div className="space-y-8">
      <P>
        The Journal tab is the heart of the platform: a monthly calendar where every trading day shows its P&amp;L, its
        trades, and its journal entry — side by side with a filterable list of all your trades. It’s the first tab you
        land on when you open Trading.
      </P>
      <div>
        <FeatureLink>Open the Journal</FeatureLink>
      </div>

      <DocSection title="Reading the calendar">
        <Figure caption="A week on the journal calendar: green/red day P&L, a chart icon for days with trades (badge = trade count), and a book icon for the daily journal (blue check = entry saved, dashed = not yet).">
          <CalendarWeekFigure />
        </Figure>
        <Bullets
          items={[
            <>
              <Em>Day P&amp;L</Em> appears in the top-right corner of each cell — green for profitable days, red for
              losing days.
            </>,
            <>
              The <Em>chart icon</Em> appears on days that have trades. It’s green on profitable days and red on losing
              days, with a count badge when there’s more than one trade. Click it to open that day’s trade list.
            </>,
            <>
              The <Em>book icon</Em> appears on every day. Blue with a checkmark means a journal entry is saved; a
              dashed outline means the day hasn’t been journaled yet. Click it to view, write, or edit the entry.
            </>,
            <>
              <Em>Today</Em> is outlined in orange. Use the <UI>‹</UI> and <UI>›</UI> arrows next to the month name to
              move between months.
            </>,
            <>
              The header strip summarizes the visible month: <Em>Monthly PnL</Em>, <Em>Trading Days</Em>,{' '}
              <Em>Win/Loss</Em> (e.g. 3W / 2L), and <Em>Journal</Em> (how many days you journaled).
            </>,
          ]}
        />
      </DocSection>

      <DocSection title="Writing a daily journal entry">
        <Figure caption="The daily journal modal. The first three prompts are required; “Other” is optional.">
          <JournalModalFigure />
        </Figure>
        <Steps>
          <Step title="Click the book icon on any day">
            Days without an entry open straight into edit mode. Days with an entry open read-only — click{' '}
            <UI>Edit entry</UI> (the pencil) to make changes.
          </Step>
          <Step title="Answer the prompts">
            Four prompts, the same every day: <Em>What went well today?</Em> · <Em>What could you improve?</Em> ·{' '}
            <Em>Did you follow your trading plan?</Em> · <Em>Other</Em>. The first three are required — a blank one
            blocks saving and highlights the field. <Em>Other</Em> is optional.
          </Step>
          <Step title="Save">
            Click <UI>Save Entry</UI> (or <UI>Update Entry</UI> when editing). The day’s book icon turns blue with a
            checkmark.
          </Step>
        </Steps>
        <Note>
          Journal entries are tied to the <Em>date</Em>, not to individual trades. Per-trade thoughts belong in each
          trade’s Entry Notes and Exit Notes (see “Editing a trade” below). Importing a statement never writes journal
          entries for you — the journal is deliberately all yours, and empty entries can’t be saved.
        </Note>
        <P>
          To delete an entry, open it, click <UI>Edit entry</UI>, then the trash icon — you’ll get a confirmation first.
          Deleting is permanent.
        </P>
        <Tip>
          Journaling consistency is itself a trackable goal: on the <DocLink doc="goals">Goals</DocLink> tab, the{' '}
          <Em>Journaling consistency</Em> metric measures the percentage of trading days you journaled.
        </Tip>
      </DocSection>

      <DocSection title="Viewing a day’s trades">
        <P>
          Click a day’s chart icon to open the <Em>Trades for that date</Em> modal: the day’s trade count and total
          P&amp;L up top, a symbol filter and side selector, and a table of each trade — Symbol, Side, Shares, Entry,
          Exit, P&amp;L, and Status.
        </P>
      </DocSection>

      <DocSection title="The All Trades panel">
        <Figure caption="The All Trades table: sortable columns, status pills, and per-row edit/delete.">
          <TradesTableFigure />
        </Figure>
        <P>
          To the right of the calendar (below it on mobile) lives the complete trade list across all dates.
        </P>
        <Bullets
          items={[
            <>
              <Em>Filter</Em> by symbol with the search box, and by direction with the <UI>All Sides</UI> /{' '}
              <UI>Long</UI> / <UI>Short</UI> selector.
            </>,
            <>
              <Em>Sort</Em> by clicking the <Em>Date/Time</Em>, <Em>Symbol</Em>, or <Em>PnL</Em> column headers.
            </>,
            <>
              <Em>Status pills</Em>: green <UI>CLOSED</UI> for completed round trips, amber <UI>OPEN</UI> for positions
              still on.
            </>,
            <>
              <Em>Edit</Em> (pencil) or <Em>delete</Em> (trash) any row. Use the header checkbox to select many rows,
              then the red <UI>Delete (N)</UI> button to remove them together.
            </>,
            <>
              <UI>Import CSV</UI> and <UI>Export CSV</UI> buttons live in the panel header — see{' '}
              <DocLink doc="importing">Importing Trades &amp; Broker Data</DocLink>.
            </>,
          ]}
        />
        <Warn>
          Deleting trades cannot be undone. The confirmation dialog says exactly that — read the count before you
          confirm.
        </Warn>
      </DocSection>

      <DocSection title="Editing a trade">
        <P>
          Click the pencil on any trade to open the editor. You can change: <Em>Symbol</Em>, <Em>Side</Em> (LONG /
          SHORT), <Em>Shares</Em>, <Em>Entry Price</Em>, <Em>Entry Date</Em>, <Em>Exit Price</Em> (optional),{' '}
          <Em>Status</Em>, <Em>Entry Notes</Em>, <Em>Exit Notes</Em>, and <Em>Followed my plan?</Em>. When you supply an
          exit price, P&amp;L is recalculated automatically (with a small estimated-fee model when the broker fee isn’t
          known).
        </P>
        <Tip>
          <Em>Followed my plan?</Em> feeds the <Em>Plan adherence</Em> goal metric — mark it honestly on every closed
          trade and the Goals tab will show your discipline rate over time.
        </Tip>
      </DocSection>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Importing trades & broker data
// ---------------------------------------------------------------------------

export function ImportingArticle() {
  return (
    <div className="space-y-8">
      <P>
        Your broker data gets into ConfluenceTrading through <Em>statement imports</Em> — you export a CSV from your
        broker and drop it into the app. One thinkorswim Account Statement carries everything: executed trades, daily
        account balances for the equity curve, and broker fees. Re-importing is always safe.
      </P>
      <div>
        <FeatureLink>Open the Journal to import</FeatureLink>
      </div>

      <DocSection title="Where to import">
        <P>
          Two buttons open the same import dialog on the Journal tab: the green <UI>Import</UI> button in the calendar
          header, and <UI>Import CSV</UI> at the top of the All Trades panel.
        </P>
        <Figure caption="The import dialog. Drag a CSV in or click Select File, then Import Trades.">
          <ImportDropzoneFigure />
        </Figure>
      </DocSection>

      <DocSection title="Importing from thinkorswim (recommended)">
        <Steps>
          <Step title="Export the Account Statement">
            In the thinkorswim desktop platform go to <UI>Monitor</UI> → <UI>Account Statement</UI>. Set the date range
            you want (a single day, a month, or your full history), then export to CSV.
          </Step>
          <Step title="Open the import dialog">
            On the Journal tab, click the green <UI>Import</UI> button.
          </Step>
          <Step title="Drop the file in">
            Drag the CSV onto the drop zone, or click <UI>Select File</UI> and pick it.
          </Step>
          <Step title="Click Import Trades">
            The app auto-detects the statement format, pairs your buy and sell fills into round-trip trades, and shows a
            result summary — including any rows it couldn’t parse and how to fix them.
          </Step>
          <Step title="Check the calendar">
            Imported days light up with their P&amp;L immediately, and the Performance and Goals tabs refresh on their
            own — no reload needed.
          </Step>
        </Steps>
        <P>One Account Statement import updates four things at once:</P>
        <RefTable
          rows={[
            ['Trades', <>Buy/sell fills are FIFO-paired into round trips with per-trade P&amp;L. Re-importing a date replaces that date’s imported trades, so uploading overlapping statements never duplicates.</>],
            ['Starting balance', <>Read from the statement’s cash balance. Only an <Em>earlier</Em> statement can move the baseline, so daily uploads never inflate your starting point.</>],
            ['Daily balances', <>Your broker’s end-of-day account value per day — these anchor the Performance equity curve to real numbers.</>],
            ['Broker fees', <>Stock-borrow fees, commissions, and regulatory charges per day — shown as the Broker Fees metric on Performance.</>],
          ]}
        />
        <Note>
          Charles Schwab statement exports use the same format and import the same way.
        </Note>
      </DocSection>

      <DocSection title="Importing a generic CSV">
        <P>
          Not on thinkorswim? Any CSV with your trades works. The importer first tries the standard template columns
          (Date, Symbol, Side, Entry_Price, Exit_Price, Shares, …), and falls back to auto-detecting symbol, price, and
          quantity columns in generic files. Grab the template from the <UI>Need a template? Download CSV</UI> link at
          the bottom of the import dialog, fill it in a spreadsheet, and save as CSV.
        </P>
      </DocSection>

      <DocSection title="File rules and troubleshooting">
        <Bullets
          items={[
            <>
              <Em>CSV or TXT only.</Em> Excel files (.xlsx/.xls) are rejected — in Excel use <UI>File</UI> →{' '}
              <UI>Save As</UI> → <Em>CSV (Comma delimited)</Em> and import that instead.
            </>,
            <>
              <Em>Max file size ~4.5 MB.</Em> For long histories, export in chunks (e.g. one quarter at a time) and
              import each — replace-by-date keeps everything consistent.
            </>,
            <>
              <Em>Failed rows are listed.</Em> If some rows can’t be parsed, the result panel shows the first few with a{' '}
              <Em>“How to fix it”</Em> hint list. The rest of the file still imports.
            </>,
            <>
              <Em>Journal entries are never auto-created.</Em> Imports bring in trades and balances; journaling each day
              is up to you.
            </>,
          ]}
        />
      </DocSection>

      <DocSection title="Exporting your data">
        <P>
          Your data is yours. Click <UI>Export CSV</UI> in the All Trades panel to download every trade (respecting any
          active filters) as a CSV you can open in any spreadsheet.
        </P>
      </DocSection>

      <DocSection title="What about a live brokerage connection?">
        <P>
          There is one — trades can sync straight from your broker through SnapTrade, so you don&apos;t have to export a
          file every day. It&apos;s <OwnerBadge /> for now, and it doesn&apos;t replace statement import: the two run side
          by side, and statement balances still drive the equity curve. See{' '}
          <DocLink doc="brokerage-sync">Brokerage Sync (SnapTrade)</DocLink> for how it works.
        </P>
      </DocSection>
    </div>
  );
}

export function BrokerageSyncArticle() {
  return (
    <div className="space-y-8">
      <P>
        Instead of exporting a statement every day, you can link your brokerage once and let trades flow in on their own.
        That link runs through <Em>SnapTrade</Em>, and this page explains what that is, what it can and can&apos;t do,
        and how synced trades sit alongside the ones you import by hand.
      </P>
      <div>
        <FeatureLink>Open the Journal to connect</FeatureLink>
      </div>

      <DocSection title="What SnapTrade is">
        <P>
          SnapTrade is a licensed third-party service that specializes in brokerage connections. Rather than
          ConfluenceTrading building and maintaining a separate integration for every broker — each with its own login
          system, API, and approval process — SnapTrade maintains those connections and exposes one common interface for
          reading your account data.
        </P>
        <P>
          Practically, it means you log in to <Em>your broker</Em>, on your broker&apos;s own page, and the broker tells
          SnapTrade it may read that account. ConfluenceTrading then reads your executed trades through SnapTrade.
        </P>
        <Note>
          Your brokerage username and password are never typed into ConfluenceTrading and never stored here. The login
          happens on the broker&apos;s side of the connection; this app only ever holds a revocable authorization.
        </Note>
      </DocSection>

      <DocSection title="Read-only, by design">
        <P>
          The connection is requested in <Em>read</Em> mode. It can list your accounts and pull your trade history — it
          cannot place, modify, or cancel an order, and it cannot move money. Nothing about linking a brokerage here
          gives the app the ability to trade for you.
        </P>
        <Warn>
          Agentic order placement is a completely separate system with its own credentials, arming switches, and kill
          switch. Connecting a brokerage for journaling does not arm anything.
        </Warn>
      </DocSection>

      <DocSection title="Connecting an account">
        <Steps>
          <Step title="Start from the Journal or Performance tab">
            Both tabs carry the brokerage strip at the top. Click <UI>Connect Broker</UI> to open the dialog, then{' '}
            <UI>Connect account</UI>.
          </Step>
          <Step title="Pick your broker and log in">
            You&apos;re handed to SnapTrade&apos;s secure Connection Portal — Robinhood, Schwab, Fidelity, Webull, E*TRADE,
            tastytrade, Interactive Brokers, Coinbase and others. Log in there and approve read access.
          </Step>
          <Step title="Come back and let the first sync run">
            You land back on the Journal automatically. The first pull starts on its own and a banner reports how many
            trades it wrote — you don&apos;t need to press anything.
          </Step>
        </Steps>
        <Tip>
          An empty first sync is normal and not a failure. Brokers backfill trade history asynchronously after a new
          link, so the trades often arrive minutes later. Press <UI>Refresh data</UI> then, or let the overnight sync
          pick them up.
        </Tip>
      </DocSection>

      <DocSection title="When it syncs">
        <Bullets
          items={[
            <>
              <Em>On connect</Em> — the first pull runs the moment you return from the portal.
            </>,
            <>
              <Em>On demand</Em> — <UI>Refresh data</UI> on the brokerage strip pulls immediately.
            </>,
            <>
              <Em>Overnight</Em> — an automatic sync runs once a day, so the calendar stays current without you
              touching it.
            </>,
          ]}
        />
      </DocSection>

      <DocSection title="Synced trades vs. imported trades">
        <P>
          Both kinds live in the same trade list and look the same on the calendar, so the brokerage strip spells out the
          split — for example <UI>142 from broker · 88 imported</UI>. That line is the quickest way to confirm live data
          is actually arriving rather than assuming it is.
        </P>
        <RefTable
          headers={['Behaviour', 'What to expect']}
          rows={[
            ['Ownership', 'A sync only ever rewrites broker-sourced trades. Trades you imported or typed in are never touched.'],
            ['Your notes survive', 'Journal fields you wrote on a synced trade — notes, plan adherence, tags — carry forward across re-syncs.'],
            ['Empty results are ignored', 'If a sync returns nothing, it writes nothing. An empty feed can never blank your trade list.'],
            ['Equity curve', 'Account-statement balances remain the source of truth for NLV. Synced trades add P&L after the last statement balance date.'],
          ]}
        />
        <Note>
          That last row surprises people: if you connect a broker and the equity curve doesn&apos;t visibly move, it&apos;s
          usually because the synced trades pre-date your most recent imported statement balance — the statement already
          accounted for them. See <DocLink doc="performance">Performance &amp; Analytics</DocLink>.
        </Note>
      </DocSection>

      <DocSection title="Disconnecting">
        <P>
          <UI>Manage</UI> on the brokerage strip opens the same dialog, where <UI>Disconnect</UI> removes the link and
          stops all future syncing. Trades already pulled stay in your journal — disconnecting is not a delete. You can
          also revoke access from your broker&apos;s own security settings at any time.
        </P>
      </DocSection>
    </div>
  );
}
