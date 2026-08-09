/**
 * Email confirmation. Single purpose, single button — the faster this is to
 * act on, the fewer accounts strand themselves on an unconfirmed address.
 */

import { Section, Text, Button, Link } from '@react-email/components';
import * as React from 'react';
import { PersonalEmailLayout } from './PersonalEmailLayout';

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

export function VerifyEmail({ name, verifyUrl }: { name?: string; verifyUrl: string }) {
  return (
    <PersonalEmailLayout
      previewText="Confirm your email to finish setting up ConfluenceTrading."
      footerReason="You're receiving this because an account was created with this email address."
    >
      <Section style={{ padding: '0 24px' }}>
        <Text style={heading}>Confirm your email{name ? `, ${name.split(' ')[0]}` : ''}</Text>
        <Text style={body}>
          One click and your account is fully set up. Confirming also means we can actually reach
          you if you ever need a password reset.
        </Text>

        <Section style={{ textAlign: 'center' as const, padding: '8px 0 4px' }}>
          <Button
            href={verifyUrl}
            style={{
              backgroundColor: '#F97316',
              color: '#ffffff',
              borderRadius: '10px',
              padding: '12px 28px',
              fontSize: '14px',
              fontWeight: 700,
            }}
          >
            Confirm my email
          </Button>
        </Section>

        <Text style={footnote}>
          Button not working? Paste this into your browser:
          <br />
          <Link href={verifyUrl} style={{ color: '#F97316', fontSize: '12px', wordBreak: 'break-all' as const }}>
            {verifyUrl}
          </Link>
        </Text>
        <Text style={footnote}>
          The link works once and expires in 24 hours. If you didn&apos;t create this account you
          can ignore this email, or tell us at {SUPPORT_EMAIL}.
        </Text>
      </Section>
    </PersonalEmailLayout>
  );
}
