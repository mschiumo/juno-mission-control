'use client';

import { DocSection, P, Em, Bullets, Steps, Step, Tip, Note, Warn, UI, TierBadge, PageLink, DocLink, Figure, RefTable } from './DocsPrimitives';
import { PortfolioStatsFigure } from './DocsFigures';

// ---------------------------------------------------------------------------
// Portfolio — the long-term investment account
// ---------------------------------------------------------------------------

export function PortfolioArticle() {
  return (
    <div className="space-y-8">
      <div className="flex items-center gap-2">
        <TierBadge tier="platinum" />
      </div>
      <P>
        The Trading tab is about the trades you take this week. <Em>Portfolio</Em> is the other half of the book: the
        buy-and-hold account you don&apos;t touch — positions, dividends, deposits, and a weekly AI review of how the
        whole thing is put together. It&apos;s a top-level tab, next to Trading in the header.
      </P>
      <div>
        <PageLink href="/?tab=portfolio">Open Portfolio</PageLink>
      </div>

      <DocSection title="A separate connection, on purpose">
        <P>
          Portfolio links its <Em>own</Em> brokerage account through SnapTrade, independent of the one feeding your
          Journal. That separation is the point: long-term holdings would distort every trading statistic you have.
        </P>
        <Warn>
          Nothing in Portfolio ever reaches the Trading tab. Its positions never appear in your trade list, its
          balances never touch the Performance equity curve, and its dividends and deposits are never counted as
          trading P&amp;L. The two accounts are read and reported completely separately.
        </Warn>
        <P>
          Connecting works the same way as the trading connection — you log in at your broker, approve read-only
          access, and come back. Nothing here can place an order or move money. The mechanics, the security model, and
          how to revoke access are all covered in <DocLink doc="brokerage-sync">Brokerage Sync (SnapTrade)</DocLink>.
        </P>
      </DocSection>

      <DocSection title="Reading the tab">
        <Figure caption="The Portfolio stat strip: total value, the week's move, unrealized P&L, cash, and trailing-year dividends.">
          <PortfolioStatsFigure />
        </Figure>
        <RefTable
          headers={['Section', 'What it shows']}
          rows={[
            [
              'Stat cards',
              <>
                <Em>Total Value</Em> (the account&apos;s market value, with its position count), <Em>Past Week</Em>{' '}
                (the last seven days in dollars and percent), <Em>Unrealized P&amp;L</Em> (market value against cost
                basis), <Em>Cash</Em>, and <Em>Dividends 12m</Em> (income received over the trailing year).
              </>,
            ],
            ['Value chart', 'The account value over time, so a long-term position reads as a slope rather than a single number.'],
            [
              'Holdings',
              <>
                Every position with its quantity, cost basis, market value, and unrealized gain or loss. The table
                scrolls on its own so a long book doesn&apos;t push the rest of the page away.
              </>,
            ],
            [
              'Transactions',
              <>
                The account&apos;s cash-flow history, filterable by <UI>Deposits</UI>, <UI>Withdrawals</UI>,{' '}
                <UI>Dividends</UI>, <UI>Interest</UI>, <UI>Trades</UI>, <UI>Fees</UI>, <UI>Transfers</UI>, and{' '}
                <UI>Other</UI>. Rows that fit a detected repeating schedule — a recurring contribution, a quarterly
                dividend — are flagged as such.
              </>,
            ],
            ['Weekly review', 'The AI portfolio review, described below.'],
          ]}
        />
      </DocSection>

      <DocSection title="The weekly AI review">
        <P>
          Every Saturday morning a review of the account is written automatically and added to the list. Click a review
          tile to open the full report, which is structured in four parts:
        </P>
        <RefTable
          rows={[
            ['Key takeaway', 'The one thing worth knowing about the portfolio this week.'],
            ['Health', 'How the book is put together — concentration, sector or single-name weight, cash level, and how the income side is doing.'],
            ['Repositioning', 'Where the allocation has drifted from what it looks like you intended, and what would bring it back.'],
            ['Watch', 'Things worth keeping an eye on rather than acting on today.'],
          ]}
        />
        <Steps>
          <Step title="Wait for Saturday, or run it yourself">
            Click <UI>Run review</UI> (<UI>Run again</UI> once one exists) to generate a review on demand.
          </Step>
          <Step title="Open the report">
            Click any tile in the list to read the full write-up. Past reviews are kept — the list is the history.
          </Step>
        </Steps>
        <Note>
          Manual reviews are capped at <Em>one per day per user</Em>, because a portfolio review sends the largest
          context of any report in the app. The button&apos;s tooltip shows what you have left, and the Saturday
          review doesn&apos;t use up your allowance. See{' '}
          <DocLink doc="plans">Plans &amp; Your Account</DocLink>.
        </Note>
        <Tip>
          The review reads the account as it stands right now, so running one right after a big contribution or a
          rebalance gives you a genuinely different report than last Saturday&apos;s.
        </Tip>
      </DocSection>

      <DocSection title="Keeping it current">
        <Bullets
          items={[
            <>
              <Em>Automatic</Em> — the portfolio account syncs twice a day, so holdings and transactions stay current
              without you doing anything.
            </>,
            <>
              <Em>On demand</Em> — the refresh control at the top of the tab forces a fresh pull from the broker rather
              than re-reading what was last stored.
            </>,
            <>
              <Em>Disconnecting</Em> — the unlink control removes the portfolio connection. It has no effect on your
              trading brokerage connection, which is a separate link entirely.
            </>,
          ]}
        />
      </DocSection>
    </div>
  );
}
