import Link from 'next/link';

export const metadata = {
  title: 'Terms & Conditions — ConfluenceTrading',
  description:
    'Terms of service, risk disclosure, and legal notices for ConfluenceTrading.',
};

/**
 * Terms & Conditions + Risk Disclosure.
 *
 * NOTE FOR THE OWNER: this is a working draft, not legal advice. Have a
 * licensed attorney review it (especially the indemnification, limitation of
 * liability, and governing-law sections) before charging real money.
 */

const EFFECTIVE_DATE = 'August 9, 2026';
const SUPPORT_EMAIL = 'confluencetradingsupport@gmail.com';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="text-lg font-bold text-white mb-3">{title}</h2>
      <div className="space-y-3 text-sm text-[#8b949e] leading-relaxed">{children}</div>
    </section>
  );
}

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-[#0d1117] text-[#e6edf3]">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-12">
        <Link href="/" className="text-sm text-[#F97316] hover:underline">
          ← ConfluenceTrading
        </Link>
        <h1 className="text-3xl font-bold text-white mt-4 mb-2">Terms &amp; Conditions</h1>
        <p className="text-xs text-[#8b949e] mb-10">Effective date: {EFFECTIVE_DATE}</p>

        {/* Risk banner — the part every trader must actually read */}
        <div className="mb-10 rounded-xl border border-[#d29922]/40 bg-[#d29922]/10 p-5">
          <h2 className="text-sm font-bold text-[#d29922] uppercase tracking-wide mb-2">
            Risk Disclosure — Read First
          </h2>
          <p className="text-sm text-[#c9d1d9] leading-relaxed">
            ConfluenceTrading is a trading journal, analytics, and market-information tool.{' '}
            <strong>Nothing in the Service is financial, investment, tax, or legal advice.</strong>{' '}
            Trading stocks, options, and other instruments involves substantial risk of loss and is
            not suitable for every investor. Past performance — yours, ours, or anything shown in
            the Service — does not guarantee future results. You alone are responsible for every
            trading decision you make and for any losses that result. If you need investment
            advice, consult a licensed financial advisor.
          </p>
        </div>

        <Section title="1. Acceptance of These Terms">
          <p>
            By creating an account, accessing, or using ConfluenceTrading (the &ldquo;Service&rdquo;),
            you agree to be bound by these Terms &amp; Conditions (the &ldquo;Terms&rdquo;). If you
            do not agree, do not use the Service. We may update these Terms from time to time;
            continued use after changes take effect constitutes acceptance. Material changes will be
            noted on this page with a new effective date.
          </p>
        </Section>

        <Section title="2. The Service">
          <p>
            ConfluenceTrading provides trading journaling, performance analytics, market news and
            data displays, AI-generated journal commentary, and — on applicable plans — software
            tools that operate within user-defined parameters. The Service is provided by the
            operator of ConfluenceTrading (&ldquo;we&rdquo;, &ldquo;us&rdquo;, the
            &ldquo;Operator&rdquo;).
          </p>
          <p>
            We are <strong>not</strong> a broker-dealer, investment advisor, commodity trading
            advisor, or fiduciary, and we are not registered with the SEC, FINRA, CFTC, or any
            other financial regulator. Brokerage connectivity is provided through third-party
            services (including SnapTrade) and your own brokerage; your relationship with your
            broker is governed solely by your agreement with that broker.
          </p>
        </Section>

        <Section title="3. No Financial Advice">
          <p>
            All content in the Service — including analytics, statistics, AI-generated reports and
            insights, market briefings, news categorization, screeners, projections, and any output
            of automated or agentic features — is provided for informational and educational
            purposes only. It does not constitute a recommendation, solicitation, or offer to buy
            or sell any security or instrument, and it is not tailored investment advice. AI
            output in particular may be incomplete, outdated, or wrong.
          </p>
        </Section>

        <Section title="4. Assumption of Risk">
          <p>
            You acknowledge and agree that: (a) all trading and investment decisions are made
            solely by you, at your own risk; (b) you may lose some or all of your invested
            capital; (c) automated features act only within parameters you configure and approve,
            and you remain fully responsible for their activity in your accounts; and (d) market
            data, news, and quotes may be delayed, inaccurate, or unavailable, and you will not
            rely on the Service as your sole source of market information.
          </p>
        </Section>

        <Section title="5. Accounts, Plans & Billing">
          <p>
            Silver is a free plan. Gold and Platinum are paid subscriptions billed monthly or
            annually at the prices shown on the pricing page. Trials and referral grants convert
            or expire automatically; when a paid plan, trial, or referral period ends, paid
            features stop and any linked brokerage connection is disconnected. You may cancel or
            downgrade at any time from the Plans page; cancellation disconnects your brokerage
            connection immediately. Fees already paid are non-refundable except where required by
            law. Prices may change with notice; changes apply from your next billing period.
          </p>
        </Section>

        <Section title="6. Brokerage Connections">
          <p>
            Connecting a brokerage account is optional and available on applicable plans. You
            authorize us and our connectivity providers to access your brokerage data (accounts,
            balances, positions, transactions) solely to provide the Service. We do not store your
            brokerage credentials. Where an applicable plan includes agentic features, any order
            activity occurs through connections and parameters you explicitly configure, and you
            can pause or revoke access at any time.
          </p>
        </Section>

        <Section title="7. Indemnification">
          <p>
            To the maximum extent permitted by law, you agree to indemnify, defend, and hold
            harmless the Operator, and the Operator&rsquo;s affiliates, officers, employees,
            contractors, and agents, from and against any and all claims, demands, actions,
            damages, losses, liabilities, costs, and expenses (including reasonable attorneys&rsquo;
            fees) arising out of or relating to: (a) your use of the Service; (b) your trading or
            investment decisions and their outcomes, including any financial losses; (c) your
            violation of these Terms; or (d) your violation of any law or the rights of any third
            party.
          </p>
        </Section>

        <Section title="8. Disclaimer of Warranties">
          <p>
            THE SERVICE IS PROVIDED &ldquo;AS IS&rdquo; AND &ldquo;AS AVAILABLE&rdquo;, WITHOUT
            WARRANTIES OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING WARRANTIES OF MERCHANTABILITY,
            FITNESS FOR A PARTICULAR PURPOSE, ACCURACY, AND NON-INFRINGEMENT. WE DO NOT WARRANT
            THAT THE SERVICE WILL BE UNINTERRUPTED, ERROR-FREE, OR SECURE, OR THAT DATA (INCLUDING
            MARKET DATA AND AI OUTPUT) WILL BE ACCURATE OR COMPLETE.
          </p>
        </Section>

        <Section title="9. Limitation of Liability">
          <p>
            TO THE MAXIMUM EXTENT PERMITTED BY LAW, THE OPERATOR SHALL NOT BE LIABLE FOR ANY
            INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR FOR ANY TRADING
            LOSSES, LOST PROFITS, OR LOST DATA, ARISING OUT OF OR RELATING TO THE SERVICE, EVEN IF
            ADVISED OF THE POSSIBILITY OF SUCH DAMAGES. OUR TOTAL AGGREGATE LIABILITY FOR ANY
            CLAIM SHALL NOT EXCEED THE AMOUNT YOU PAID US FOR THE SERVICE IN THE TWELVE (12)
            MONTHS PRECEDING THE CLAIM (OR $50 IF YOU USED ONLY THE FREE PLAN). Some jurisdictions
            do not allow certain limitations; in those jurisdictions these limitations apply to the
            fullest extent permitted.
          </p>
        </Section>

        <Section title="10. Acceptable Use & Termination">
          <p>
            You agree not to misuse the Service — including attempting to access other users&rsquo;
            data, reverse-engineering, scraping at scale, reselling data feeds, or using the
            Service for unlawful activity. We may suspend or terminate accounts that violate these
            Terms. You may delete your account at any time from your profile; deletion removes
            your data from the Service and disconnects any linked brokerage.
          </p>
        </Section>

        <Section title="11. Data & Privacy">
          <p>
            We store the data you provide (journal entries, imported statements, preferences) and
            data retrieved from connected services, and use it solely to operate the Service.
            Brokerage tokens are encrypted at rest. We do not sell your personal data. AI features
            send relevant journal and trade context to our AI provider to generate reports.
          </p>
        </Section>

        <Section title="12. Governing Law & Disputes">
          <p>
            These Terms are governed by the laws of the jurisdiction in which the Operator
            resides, without regard to conflict-of-law rules. Any dispute arising from these Terms
            or the Service shall be resolved in the courts of that jurisdiction, and you consent
            to their exclusive jurisdiction and venue.
          </p>
        </Section>

        <Section title="13. Contact">
          <p>
            Questions about these Terms:{' '}
            <a href={`mailto:${SUPPORT_EMAIL}`} className="text-[#F97316] hover:underline">
              {SUPPORT_EMAIL}
            </a>
            .
          </p>
        </Section>

        <p className="text-xs text-[#484f58] mt-12">
          © {new Date().getFullYear()} ConfluenceTrading. All rights reserved.
        </p>
      </div>
    </div>
  );
}
