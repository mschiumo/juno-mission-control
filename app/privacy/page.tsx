import Link from 'next/link';

export const metadata = {
  title: 'Privacy Policy — ConfluenceTrading',
  description: 'What ConfluenceTrading collects, how it is used, and your choices.',
};

/**
 * NOTE FOR THE OWNER: working draft, not legal advice — have the same
 * attorney who reviews the Terms review this (data-protection obligations
 * vary by jurisdiction).
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

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-[#0d1117] text-[#e6edf3]">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-12">
        <Link href="/" className="text-sm text-[#F97316] hover:underline">
          ← ConfluenceTrading
        </Link>
        <h1 className="text-3xl font-bold text-white mt-4 mb-2">Privacy Policy</h1>
        <p className="text-xs text-[#8b949e] mb-10">Effective date: {EFFECTIVE_DATE}</p>

        <Section title="1. What We Collect">
          <p>
            <strong className="text-[#c9d1d9]">Account data</strong> — name, email address, a
            hashed password, and an optional profile photo.
          </p>
          <p>
            <strong className="text-[#c9d1d9]">Trading data you provide</strong> — journal
            entries, imported broker statements, trades, notes, tags, goals, watchlists, and
            preferences.
          </p>
          <p>
            <strong className="text-[#c9d1d9]">Brokerage data</strong> — if you connect a
            brokerage (paid plans), we receive read access to accounts, balances, positions, and
            transactions through our connectivity provider, SnapTrade. We never see or store your
            brokerage username or password; access tokens are encrypted at rest, and disconnecting
            (or cancelling, or deleting your account) revokes our access.
          </p>
          <p>
            <strong className="text-[#c9d1d9]">Billing data</strong> — payments are processed by
            Stripe. We never see or store card numbers; we keep only a Stripe customer and
            subscription reference.
          </p>
        </Section>

        <Section title="2. How We Use It">
          <p>
            Solely to operate the Service: rendering your journal and analytics, generating the
            AI reports you request (relevant journal and trade context is sent to our AI provider,
            Anthropic, for that purpose), sending the emails described below, processing
            subscriptions, and keeping the Service secure. We do not sell your personal data, and
            we do not use your trading data for advertising.
          </p>
        </Section>

        <Section title="3. Email">
          <p>
            We send transactional and account email (welcome, password reset, trial and billing
            notices) and, with your opt-in, market briefings. A short onboarding check-in can be
            opted out of by replying. Email is delivered by Resend.
          </p>
        </Section>

        <Section title="4. Service Providers">
          <p>
            We share data only with the processors that run the Service: Vercel (hosting), our
            database provider (encrypted data storage), SnapTrade (brokerage connectivity),
            Stripe (payments), Resend (email), and Anthropic (AI report generation). Each
            receives only what its function requires.
          </p>
        </Section>

        <Section title="5. Retention & Deletion">
          <p>
            Your data stays while your account exists. Deleting your account (Profile → Delete
            Account) immediately disconnects any linked brokerage, cancels any subscription, and
            permanently removes your account and trading data from the Service. Statement exports
            are available any time before deletion.
          </p>
        </Section>

        <Section title="6. Cookies">
          <p>
            We use only the session cookie required to keep you signed in. No advertising or
            cross-site tracking cookies.
          </p>
        </Section>

        <Section title="7. Security">
          <p>
            Passwords are stored as bcrypt hashes, brokerage tokens are encrypted at rest, and
            all traffic is TLS. No system is perfectly secure; if we learn of a breach affecting
            your data we will notify you promptly.
          </p>
        </Section>

        <Section title="8. Your Rights">
          <p>
            You can access, correct, export, or delete your data at any time from within the
            Service, or by writing to us. Depending on where you live you may have additional
            statutory rights; requests go to the address below.
          </p>
        </Section>

        <Section title="9. Age">
          <p>The Service is not directed to anyone under 18, and we do not knowingly collect data from them.</p>
        </Section>

        <Section title="10. Changes & Contact">
          <p>
            Material changes will be reflected here with a new effective date. Questions or
            requests:{' '}
            <a href={`mailto:${SUPPORT_EMAIL}`} className="text-[#F97316] hover:underline">
              {SUPPORT_EMAIL}
            </a>
            . See also our{' '}
            <Link href="/terms" className="text-[#F97316] hover:underline">
              Terms &amp; Conditions
            </Link>
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
