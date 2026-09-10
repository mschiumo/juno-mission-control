'use client';

import { DocSection, P, Em, Bullets, Steps, Step, Tip, Note, Warn, UI, FeatureLink, PageLink, DocLink, Figure, RefTable } from './DocsPrimitives';
import { PlanTiersFigure } from './DocsFigures';

// ---------------------------------------------------------------------------
// Plans, billing, and your account
// ---------------------------------------------------------------------------

export function PlansArticle() {
  return (
    <div className="space-y-8">
      <P>
        ConfluenceTrading has three plans. <Em>Silver</Em> is free forever and covers the whole journaling and
        analytics workflow. <Em>Gold</Em> adds the things that cost real money to run — a live brokerage connection and
        AI. <Em>Platinum</Em> adds the long-term Portfolio tab and Agents. Everything you write stays yours on every
        plan, including after a downgrade.
      </P>
      <div className="flex gap-2 flex-wrap">
        <PageLink href="/plans">See plans &amp; pricing</PageLink>
        <PageLink href="/profile">Open your profile</PageLink>
      </div>

      <DocSection title="What each plan includes">
        <Figure caption="The three plans. Silver is free; Gold and Platinum are monthly or annual.">
          <PlanTiersFigure />
        </Figure>
        <RefTable
          headers={['Plan', 'What you get']}
          rows={[
            [
              <>Silver<br /><span className="text-xs font-normal" style={{ color: 'var(--text-tertiary)' }}>Free</span></>,
              <>
                The <DocLink doc="journal">Trading Journal</DocLink> with{' '}
                <DocLink doc="importing">statement imports</DocLink>,{' '}
                <DocLink doc="trade-management">Trade Management</DocLink>,{' '}
                <DocLink doc="performance">Performance</DocLink>,{' '}
                <DocLink doc="projection">Profit Projection</DocLink>, Market News, and these docs.
              </>,
            ],
            [
              <>Gold<br /><span className="text-xs font-normal num" style={{ color: 'var(--text-tertiary)' }}>$29/mo</span></>,
              <>
                Everything in Silver, plus <DocLink doc="brokerage-sync">live brokerage sync</DocLink>, the full{' '}
                <DocLink doc="market">Market tab</DocLink> (gap scanner, live data, morning briefing),{' '}
                <Em>AI Journal Insights</Em>, the daily briefing and recap emails, and{' '}
                <DocLink doc="goals">Trading Goals</DocLink>.
              </>,
            ],
            [
              <>Platinum<br /><span className="text-xs font-normal num" style={{ color: 'var(--text-tertiary)' }}>$59/mo</span></>,
              <>
                Everything in Gold, plus the <DocLink doc="portfolio">Portfolio tab</DocLink> (a second, long-term
                brokerage connection with a weekly AI review) and <DocLink doc="agents">Agents</DocLink>.
              </>,
            ],
          ]}
        />
        <P>
          Paying annually is <Em>10% off</Em> twelve months up front. Prices are per user, and there is only ever one
          plan on an account.
        </P>
        <Note>
          Tabs outside your plan are not rendered at all — there are no locked or teased panels in the app. If a
          section this manual describes isn&apos;t in your tab bar, it belongs to a higher plan; check{' '}
          <UI>Plan</UI> on your profile.
        </Note>
      </DocSection>

      <DocSection title="Trying Gold free for a week">
        <P>
          Every account gets one <Em>7-day Gold trial</Em> — full Gold access, no card required. Open{' '}
          <UI>Choose your plan</UI> and click <UI>Start free week</UI>. Your profile then shows{' '}
          <Em>Gold · Free trial</Em> with the date access ends.
        </P>
        <Steps>
          <Step title="Verify your email first">
            Trials and checkout both require a confirmed email address. If you haven&apos;t confirmed yet, a banner at
            the top of the app offers to resend the link.
          </Step>
          <Step title="Start the trial">
            One click from the plans page. It starts immediately — no card, no cancellation to remember.
          </Step>
          <Step title="Connect a brokerage while it runs">
            The trial is the fastest way to see whether auto-synced journaling fits how you trade. See{' '}
            <DocLink doc="brokerage-sync">Brokerage Sync</DocLink>.
          </Step>
        </Steps>
        <P>
          Have a <Em>referral code</Em>? Enter it on the plans page to redeem a free window of Gold. Codes are
          case-insensitive and can be redeemed once per account.
        </P>
        <Warn>
          When a trial or referral window ends, the account degrades to free Silver on its own and any linked brokerage
          is disconnected. Your trades, journal entries, goals, and reports all stay — only the paid capabilities stop.
        </Warn>
      </DocSection>

      <DocSection title="Managing your plan">
        <Bullets
          items={[
            <>
              <Em>Upgrade or change plans</Em> — the <UI>Plan</UI> card on your profile links to the plans page. Your
              current tier, its source (trial, referral, or billing), and its renewal or expiry date are shown there.
            </>,
            <>
              <Em>Manage billing</Em> — paid subscriptions get a <UI>Manage billing</UI> button that opens the billing
              portal for payment method and invoices.
            </>,
            <>
              <Em>Cancel</Em> — <UI>Cancel subscription</UI> downgrades you to free Silver. It asks for confirmation
              first, because the linked brokerage is disconnected immediately.
            </>,
            <>
              <Em>Delete your account</Em> — at the bottom of the profile page. This removes your account and its data
              permanently; it is not the same as cancelling.
            </>,
          ]}
        />
        <Note>
          Platinum is announced but not yet self-serve — agent workspaces are provisioned one-on-one during onboarding,
          so the plans page shows a <UI>Coming soon</UI> badge rather than a checkout button. See{' '}
          <DocLink doc="agents">Agents</DocLink> for how to start that conversation.
        </Note>
      </DocSection>

      <DocSection title="Your profile and preferences">
        <P>
          Click your avatar in the header to open your profile. It holds four things:
        </P>
        <RefTable
          rows={[
            ['Account information', 'Your name and email address, and the email-confirmation state of the account.'],
            ['Plan', 'Current tier, where it came from, renewal or expiry date, and the manage/cancel controls.'],
            [
              'Email notifications',
              <>
                Two independent toggles, both Gold and up: the <Em>Morning Market Briefing</Em> (weekdays, 8 AM ET) and
                the <Em>Daily Market Recap</Em> (weekdays, 5 PM ET). See <DocLink doc="market">Market Tools</DocLink>.
              </>,
            ],
            ['Delete account', 'Permanent removal of the account and its data.'],
          ]}
        />
        <P>
          Signing in supports <UI>Remember me</UI> (which prefills your email next time) and a{' '}
          <UI>Forgot password</UI> reset by email. Your equity-curve starting balance isn&apos;t here — it&apos;s set
          from the <DocLink doc="performance">Performance</DocLink> tab.
        </P>
      </DocSection>

      <DocSection title="Fair-use limits on AI reports">
        <P>
          The AI report generators are capped per user per day so one heavy day can&apos;t exhaust the shared inference
          budget. Hover any <UI>Generate</UI> button to see how many you have left today.
        </P>
        <RefTable
          headers={['Report', 'Generations per day']}
          rows={[
            [<>AI Journal Insights <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>(Performance)</span></>, '2'],
            [<>Weekly Portfolio Review <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>(Portfolio)</span></>, '1'],
          ]}
        />
        <Tip>
          Reaching the cap never touches reports you already generated — every past report stays readable and
          downloadable, and the counter resets the next day. Scheduled reports (the automatic Saturday portfolio
          review) don&apos;t consume your manual allowance.
        </Tip>
      </DocSection>

      <DocSection title="Your data">
        <P>
          Each account&apos;s data is private to that account. You can take it with you at any time:{' '}
          <UI>Export CSV</UI> in the All Trades panel downloads your full trade history, Daily Favorites and
          gap-scanner results export from their own panels, and AI reports download as PDFs. Terms of service and the
          privacy policy are linked from the plans page and the sign-up form.
        </P>
        <div>
          <FeatureLink>Back to the Journal</FeatureLink>
        </div>
      </DocSection>
    </div>
  );
}
