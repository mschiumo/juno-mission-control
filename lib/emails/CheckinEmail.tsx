/**
 * Day-3 check-in — a short, personal note soliciting questions and honest
 * feedback. Deliberately plain: it should read like a founder email, not a
 * campaign.
 */

import { Section, Text } from '@react-email/components';
import * as React from 'react';
import { EmailLayout } from './EmailLayout';

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

const footnote: React.CSSProperties = {
  color: '#8b949e',
  fontSize: '12px',
  lineHeight: '18px',
  margin: '14px 0 0',
};

export function CheckinEmail({ name }: { name?: string }) {
  return (
    <EmailLayout previewText="Quick check-in — how is ConfluenceTrading working for you so far?">
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
        <Text style={body}>
          Just hit reply — it comes straight to me.
        </Text>
        <Text style={{ ...body, marginTop: '18px' }}>
          — Michael J. Schiuma
          <br />
          Founder, ConfluenceTrading
        </Text>
        <Text style={footnote}>
          You&apos;re receiving this because you created a ConfluenceTrading account. Reply
          &ldquo;no more check-ins&rdquo; (or write to {SUPPORT_EMAIL}) and we&apos;ll stop these
          — trading and account emails you&apos;ve opted into are unaffected.
        </Text>
      </Section>
    </EmailLayout>
  );
}
