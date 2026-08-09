/**
 * Trial-ending reminder — sent once, roughly a day before the Gold trial
 * expires. Honest about exactly what happens: automatic downgrade to free
 * Silver, journal data kept, brokerage connection disconnected.
 */

import { Section, Text, Button } from '@react-email/components';
import * as React from 'react';
import { EmailLayout } from './EmailLayout';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://confluencetrading.app';
const SUPPORT_EMAIL = 'confluencetradingsupport@gmail.com';

const heading: React.CSSProperties = {
  color: '#ffffff',
  fontSize: '20px',
  fontWeight: 700,
  margin: '0 0 8px',
};

const body: React.CSSProperties = {
  color: '#c9d1d9',
  fontSize: '14px',
  lineHeight: '22px',
  margin: '0 0 14px',
};

const infoBox: React.CSSProperties = {
  backgroundColor: '#161b22',
  border: '1px solid #30363d',
  borderRadius: '10px',
  padding: '14px 16px',
  margin: '0 0 10px',
};

const infoTitle: React.CSSProperties = {
  color: '#8b949e',
  fontSize: '11px',
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  margin: '0 0 6px',
};

const infoText: React.CSSProperties = {
  color: '#c9d1d9',
  fontSize: '13px',
  lineHeight: '20px',
  margin: 0,
};

const footnote: React.CSSProperties = {
  color: '#8b949e',
  fontSize: '12px',
  lineHeight: '18px',
  margin: '14px 0 0',
};

export function TrialEndingEmail({
  name,
  expiresAt,
}: {
  name?: string;
  expiresAt: string;
}) {
  const when = new Date(expiresAt).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
  return (
    <EmailLayout footerReason="You're receiving this because your free Gold trial is ending." previewText={`Your free Gold week ends ${when} — here's exactly what happens.`}>
      <Section style={{ padding: '0 24px' }}>
        <Text style={heading}>
          Your Gold trial ends {when}{name ? `, ${name.split(' ')[0]}` : ''}
        </Text>
        <Text style={body}>
          No surprises, and nothing to cancel — you never gave us a card. Here&apos;s exactly
          what happens when the week is up:
        </Text>

        <div style={infoBox}>
          <Text style={infoTitle}>What you keep</Text>
          <Text style={infoText}>
            Your account moves to the free Silver plan automatically. Every trade, journal entry,
            and statistic stays — the journal, risk planner, performance analytics, market news,
            and profit projection remain free forever.
          </Text>
        </div>
        <div style={infoBox}>
          <Text style={infoTitle}>What stops</Text>
          <Text style={infoText}>
            The live brokerage connection is disconnected (you can keep journaling with statement
            imports), and AI coaching reports, morning briefing emails, the full Market tab, and
            Goals pause until you&apos;re back on Gold.
          </Text>
        </div>

        <Text style={body}>
          Paid Gold subscriptions are launching very soon. If the trial earned a place in your
          routine, reply to this email and we&apos;ll make sure you&apos;re first in line — and
          that your brokerage connection doesn&apos;t miss a day.
        </Text>

        <Section style={{ textAlign: 'center' as const, padding: '10px 0 0' }}>
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
            See your plan options
          </Button>
        </Section>

        <Text style={footnote}>
          Questions? Reply here or write to {SUPPORT_EMAIL}.
        </Text>
      </Section>
    </EmailLayout>
  );
}
