/**
 * Light, personal email layout — for the lifecycle drip (welcome, check-in,
 * trial reminders). Deliberately looks like a normal email someone wrote,
 * not a product broadcast: white background, dark text, a small wordmark,
 * no hero banner. The dark EmailLayout stays for data-heavy product email
 * (briefings, digests).
 */

import {
  Html,
  Head,
  Font,
  Body,
  Container,
  Section,
  Text,
  Link,
  Hr,
  Img,
} from '@react-email/components';
import * as React from 'react';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://confluencetrading.app';

interface PersonalEmailLayoutProps {
  children: React.ReactNode;
  previewText?: string;
  /** Why the recipient is getting this — shown in the footer. */
  footerReason: string;
}

const bodyStyle: React.CSSProperties = {
  backgroundColor: '#f6f8fa',
  fontFamily: "Inter, -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif",
  margin: 0,
  padding: '24px 0',
};

const container: React.CSSProperties = {
  backgroundColor: '#ffffff',
  border: '1px solid #e5e9ef',
  borderRadius: '12px',
  margin: '0 auto',
  maxWidth: '600px',
  padding: '32px 8px 24px',
};

const wordmark: React.CSSProperties = {
  color: '#1f2328',
  fontSize: '15px',
  fontWeight: 700,
  margin: 0,
};

const wordmarkSub: React.CSSProperties = {
  color: '#8b949e',
  fontSize: '11px',
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  margin: '2px 0 0',
};

const footerText: React.CSSProperties = {
  color: '#8b949e',
  fontSize: '12px',
  lineHeight: '18px',
  margin: '0 0 6px',
  textAlign: 'center',
};

export function PersonalEmailLayout({
  children,
  previewText,
  footerReason,
}: PersonalEmailLayoutProps) {
  return (
    <Html lang="en">
      <Head>
        <Font
          fontFamily="Inter"
          fallbackFontFamily="Helvetica"
          webFont={{
            url: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap',
            format: 'woff2',
          }}
          fontWeight={400}
          fontStyle="normal"
        />
        {previewText && <meta name="description" content={previewText} />}
      </Head>
      <Body style={bodyStyle}>
        <Container style={container}>
          {/* Small header — wordmark only, no banner */}
          <Section style={{ padding: '0 24px 18px' }}>
            <Text style={wordmark}>Confluence Trading</Text>
            <Text style={wordmarkSub}>Trading Command Center</Text>
          </Section>
          <Section style={{ padding: '0 24px' }}>
            <Hr style={{ borderColor: '#e5e9ef', margin: '0 0 22px' }} />
          </Section>

          {children}

          {/* Footer */}
          <Section style={{ padding: '8px 24px 0' }}>
            <Hr style={{ borderColor: '#e5e9ef', margin: '22px 0 16px' }} />
            <Text style={footerText}>{footerReason}</Text>
            <Text style={footerText}>
              <Link href={`${APP_URL}/profile`} style={{ color: '#8b949e', textDecoration: 'underline' }}>
                Manage preferences
              </Link>
              {' · '}
              <Link href={APP_URL} style={{ color: '#8b949e', textDecoration: 'underline' }}>
                Open ConfluenceTrading
              </Link>
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

/** Shared signature block: name, title, and the founder photo underneath. */
export function FounderSignature() {
  return (
    <Section style={{ padding: '0' }}>
      <Text style={{ color: '#1f2328', fontSize: '14px', lineHeight: '22px', margin: '18px 0 10px' }}>
        — Michael J. Schiuma
        <br />
        <span style={{ color: '#8b949e', fontSize: '12px' }}>Founder, ConfluenceTrading</span>
      </Text>
      <Img
        src={`${APP_URL}/founder.jpg`}
        alt="Michael J. Schiuma"
        width="56"
        height="70"
        style={{ borderRadius: '10px', objectFit: 'cover' as const, border: '1px solid #e5e9ef' }}
      />
    </Section>
  );
}
