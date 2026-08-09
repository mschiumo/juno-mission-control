/**
 * Pre-charge reminder for a card-on-file trial.
 *
 * Sent from Stripe's `customer.subscription.trial_will_end` webhook (~3 days
 * before the charge). This email is compliance surface as much as courtesy:
 * it states the exact amount, the exact date, and how to cancel — in that
 * order, above the fold.
 */

import { Section, Text, Button } from '@react-email/components';
import * as React from 'react';
import { PersonalEmailLayout, FounderSignature } from './PersonalEmailLayout';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://confluencetrading.app';
const SUPPORT_EMAIL = 'confluencetradingsupport@gmail.com';

const heading: React.CSSProperties = {
  color: '#1f2328',
  fontSize: '20px',
  fontWeight: 700,
  margin: '0 0 10px',
};

const body: React.CSSProperties = {
  color: '#3d444d',
  fontSize: '14px',
  lineHeight: '22px',
  margin: '0 0 14px',
};

const factBox: React.CSSProperties = {
  backgroundColor: '#f6f8fa',
  border: '1px solid #e5e9ef',
  borderRadius: '10px',
  padding: '14px 16px',
  margin: '0 0 14px',
};

const footnote: React.CSSProperties = {
  color: '#8b949e',
  fontSize: '12px',
  lineHeight: '18px',
  margin: '16px 0 0',
};

export function TrialConvertingEmail({
  name,
  chargeDate,
  amount,
}: {
  name?: string;
  chargeDate: string;
  amount: string;
}) {
  const when = new Date(chargeDate).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
  return (
    <PersonalEmailLayout
      previewText={`Your trial ends ${when} — you'll be charged ${amount} unless you cancel.`}
      footerReason="You're receiving this because your ConfluenceTrading trial is about to convert to a paid subscription."
    >
      <Section style={{ padding: '0 24px' }}>
        <Text style={heading}>
          Your free trial ends {when}{name ? `, ${name.split(' ')[0]}` : ''}
        </Text>

        <div style={factBox}>
          <Text style={{ ...body, margin: 0 }}>
            On <strong>{when}</strong> the card you saved will be charged{' '}
            <strong>{amount}</strong> for ConfluenceTrading Gold, and then monthly after that.
            <br />
            <strong>Cancel any time before that date and you won&apos;t be charged a cent.</strong>
          </Text>
        </div>

        <Text style={body}>
          To cancel: open your profile, or the Plans page, and click{' '}
          <strong>Cancel subscription</strong> — two clicks, no email required, and your journal
          and every trade you&apos;ve logged stay with you on the free Silver plan.
        </Text>
        <Text style={body}>
          If the week has earned its place in your routine, do nothing and Gold keeps running:
          your brokerage stays connected, the AI coaching keeps reading your journal, and the
          morning briefings keep landing.
        </Text>

        <Section style={{ textAlign: 'center' as const, padding: '10px 0 4px' }}>
          <Button
            href={`${APP_URL}/plans`}
            style={{
              backgroundColor: '#F97316',
              color: '#ffffff',
              borderRadius: '10px',
              padding: '12px 28px',
              fontSize: '14px',
              fontWeight: 700,
            }}
          >
            Manage or cancel your plan
          </Button>
        </Section>

        <Text style={footnote}>
          Questions before the charge? Reply here or write to {SUPPORT_EMAIL} — a real person
          reads every message.
        </Text>

        <FounderSignature />
      </Section>
    </PersonalEmailLayout>
  );
}
