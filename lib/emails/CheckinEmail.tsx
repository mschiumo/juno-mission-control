/**
 * Day-3 check-in — a short, personal note soliciting questions and honest
 * feedback. Deliberately plain: it should read like a founder email, not a
 * campaign. Light, personal layout.
 */

import { Section, Text } from '@react-email/components';
import * as React from 'react';
import { PersonalEmailLayout, FounderSignature } from './PersonalEmailLayout';

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

const footnote: React.CSSProperties = {
  color: '#8b949e',
  fontSize: '12px',
  lineHeight: '18px',
  margin: '16px 0 0',
};

export function CheckinEmail({ name }: { name?: string }) {
  return (
    <PersonalEmailLayout
      previewText="Quick check-in — how is ConfluenceTrading working for you so far?"
      footerReason="You're receiving this because you created a ConfluenceTrading account."
    >
      <Section style={{ padding: '0 24px' }}>
        <Text style={heading}>How&apos;s it going{name ? `, ${name.split(' ')[0]}` : ''}?</Text>
        <Text style={body}>
          You signed up for ConfluenceTrading a few days ago — I wanted to check in personally.
        </Text>
        <Text style={body}>
          Have you gotten your first trades into the journal? If anything felt confusing, broken,
          or missing, I genuinely want to hear it — this product gets better through exactly this
          kind of feedback.
        </Text>
        <Text style={body}>
          And if you haven&apos;t tried the free Gold week yet: connecting your brokerage means
          the journal fills itself, and the AI coaching reports tend to be the moment the tool
          clicks for people.
        </Text>
        <Text style={body}>Just hit reply — it comes straight to me.</Text>

        <FounderSignature />

        <Text style={footnote}>
          Reply &ldquo;no more check-ins&rdquo; (or write to {SUPPORT_EMAIL}) and we&apos;ll stop
          these — trading and account emails you&apos;ve opted into are unaffected.
        </Text>
      </Section>
    </PersonalEmailLayout>
  );
}
