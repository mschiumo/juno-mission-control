/**
 * Password-reset email — light personal layout, single-purpose: one button,
 * one fallback link, an expiry note, and a "wasn't you? ignore this" line.
 */

import { Section, Text, Button, Link } from '@react-email/components';
import * as React from 'react';
import { PersonalEmailLayout } from './PersonalEmailLayout';

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

export function PasswordResetEmail({ name, resetUrl }: { name?: string; resetUrl: string }) {
  return (
    <PersonalEmailLayout
      previewText="Reset your ConfluenceTrading password — this link works for one hour."
      footerReason="You're receiving this because a password reset was requested for your ConfluenceTrading account."
    >
      <Section style={{ padding: '0 24px' }}>
        <Text style={heading}>Reset your password{name ? `, ${name.split(' ')[0]}` : ''}</Text>
        <Text style={body}>
          Someone (hopefully you) asked to reset the password for this ConfluenceTrading account.
          The link below works once and expires in one hour.
        </Text>

        <Section style={{ textAlign: 'center' as const, padding: '8px 0 4px' }}>
          <Button
            href={resetUrl}
            style={{
              backgroundColor: '#F97316',
              color: '#ffffff',
              borderRadius: '10px',
              padding: '12px 28px',
              fontSize: '14px',
              fontWeight: 700,
            }}
          >
            Choose a new password
          </Button>
        </Section>

        <Text style={footnote}>
          Button not working? Paste this into your browser:
          <br />
          <Link href={resetUrl} style={{ color: '#F97316', fontSize: '12px', wordBreak: 'break-all' as const }}>
            {resetUrl}
          </Link>
        </Text>
        <Text style={footnote}>
          If you didn&apos;t request this, you can safely ignore it — your password is unchanged
          and the link dies on its own.
        </Text>
      </Section>
    </PersonalEmailLayout>
  );
}
