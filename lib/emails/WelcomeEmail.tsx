/**
 * Welcome email — sent once, immediately after signup.
 * Three concrete first steps; no feature dump. Light, personal layout.
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

const stepBox: React.CSSProperties = {
  backgroundColor: '#f6f8fa',
  border: '1px solid #e5e9ef',
  borderRadius: '10px',
  padding: '14px 16px',
  margin: '0 0 10px',
};

const stepTitle: React.CSSProperties = {
  color: '#F97316',
  fontSize: '12px',
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  margin: '0 0 4px',
};

const stepText: React.CSSProperties = {
  color: '#57606a',
  fontSize: '13px',
  lineHeight: '20px',
  margin: 0,
};

const footnote: React.CSSProperties = {
  color: '#8b949e',
  fontSize: '12px',
  lineHeight: '18px',
  margin: '16px 0 0',
};

export function WelcomeEmail({ name }: { name?: string }) {
  return (
    <PersonalEmailLayout
      previewText="Your trading journal is ready — here's how to get your first insight in five minutes."
      footerReason="You're receiving this because you created a ConfluenceTrading account."
    >
      <Section style={{ padding: '0 24px' }}>
        <Text style={heading}>Welcome{name ? `, ${name.split(' ')[0]}` : ''} 👋</Text>
        <Text style={body}>
          Your ConfluenceTrading account is live. The whole point of this tool is simple: trade
          with discipline, and let your own data tell you what&apos;s working. Here&apos;s the
          fastest way in:
        </Text>

        <div style={stepBox}>
          <Text style={stepTitle}>1 · Import your trades</Text>
          <Text style={stepText}>
            Export a statement from your broker and drop it into the Journal — your P&amp;L
            calendar and equity curve build themselves from it.
          </Text>
        </div>
        <div style={stepBox}>
          <Text style={stepTitle}>2 · Plan your next trade with risk first</Text>
          <Text style={stepText}>
            Open Trade Management, set your entry, stop, and target — the calculator gives you
            your exact share size for the dollar risk you choose.
          </Text>
        </div>
        <div style={stepBox}>
          <Text style={stepTitle}>3 · Try Gold free for a week</Text>
          <Text style={stepText}>
            Connect your brokerage so the journal fills itself, get the AI morning briefing, and
            let the AI coach read your journal. No card required — it just ends if you don&apos;t
            continue.
          </Text>
        </div>

        <Section style={{ textAlign: 'center' as const, padding: '12px 0 4px' }}>
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
            Start your free Gold week
          </Button>
        </Section>

        <Text style={footnote}>
          Questions at any point — just reply to this email or write to {SUPPORT_EMAIL}. A real
          person reads every message.
        </Text>

        <FounderSignature />
      </Section>
    </PersonalEmailLayout>
  );
}
