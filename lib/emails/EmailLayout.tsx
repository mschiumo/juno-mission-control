import {
  Html,
  Head,
  Body,
  Container,
  Section,
  Text,
  Link,
  Hr,
  Font,
  Img,
  Row,
  Column,
  Button,
} from '@react-email/components';
import * as React from 'react';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://confluencetrading.app';

interface EmailLayoutProps {
  children: React.ReactNode;
  previewText?: string;
}

export function EmailLayout({ children, previewText }: EmailLayoutProps) {
  return (
    <Html lang="en">
      <Head>
        <Font
          fontFamily="Inter"
          fallbackFontFamily="Helvetica"
          webFont={{
            url: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap',
            format: 'woff2',
          }}
          fontWeight={400}
          fontStyle="normal"
        />
        {previewText && (
          <meta name="description" content={previewText} />
        )}
      </Head>
      <Body style={body}>
        <Container style={container}>
          {/* Header */}
          <Section style={header}>
            <Row>
              <Column style={{ textAlign: 'center' as const }}>
                {/* Logo mark */}
                <Img
                  src={`${APP_URL}/icon.svg`}
                  alt="Confluence"
                  width="40"
                  height="40"
                  style={{ margin: '0 auto 10px', borderRadius: '12px' }}
                />
                <Text style={headerTitle}>Confluence Trading</Text>
                <Text style={headerSubtitle}>Trading Command Center</Text>
              </Column>
            </Row>
          </Section>

          {/* Gradient accent line */}
          <Section style={{ padding: '0 0 20px' }}>
            <div style={gradientLine} />
          </Section>

          {/* Content */}
          {children}

          {/* Open Dashboard CTA */}
          <Section style={{ textAlign: 'center' as const, padding: '12px 0 24px' }}>
            <Button href={APP_URL} style={dashboardButton}>
              Open Dashboard
            </Button>
          </Section>

          {/* Footer */}
          <Hr style={divider} />
          <Section style={footer}>
            <Text style={footerText}>
              You received this because you enabled email alerts in{' '}
              <Link href={`${APP_URL}/profile`} style={footerLink}>
                your settings
              </Link>
              .
            </Text>
            <Text style={footerText}>
              <Link href={`${APP_URL}/profile`} style={footerLink}>
                Manage Preferences
              </Link>
              {' · '}
              <Link href={APP_URL} style={footerLink}>
                Open App
              </Link>
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

/* ------------------------------------------------------------------ */
/*  Styles — Dark Precision palette                                    */
/* ------------------------------------------------------------------ */

const body: React.CSSProperties = {
  backgroundColor: '#050709',
  fontFamily: 'Inter, Helvetica, Arial, sans-serif',
  margin: 0,
  padding: 0,
  WebkitFontSmoothing: 'antialiased',
};

const container: React.CSSProperties = {
  maxWidth: '680px',
  margin: '0 auto',
  padding: '24px 20px',
};

const header: React.CSSProperties = {
  textAlign: 'center' as const,
  padding: '32px 0 16px',
};

const headerTitle: React.CSSProperties = {
  color: '#EEF2F7',
  fontSize: '24px',
  fontWeight: 800,
  letterSpacing: '-0.02em',
  margin: '0 0 2px',
};

const headerSubtitle: React.CSSProperties = {
  color: '#4A5568',
  fontSize: '11px',
  fontWeight: 500,
  letterSpacing: '0.1em',
  textTransform: 'uppercase' as const,
  margin: 0,
};

const gradientLine: React.CSSProperties = {
  height: '2px',
  background: 'linear-gradient(90deg, transparent, #FF6B00, #FF8C38, transparent)',
  borderRadius: '1px',
};

const dashboardButton: React.CSSProperties = {
  backgroundColor: '#FF6B00',
  color: '#ffffff',
  fontSize: '13px',
  fontWeight: 600,
  padding: '11px 32px',
  borderRadius: '8px',
  textDecoration: 'none',
  display: 'inline-block',
  letterSpacing: '0.01em',
};

const divider: React.CSSProperties = {
  borderColor: 'rgba(255,255,255,0.06)',
  margin: '16px 0',
};

const footer: React.CSSProperties = {
  textAlign: 'center' as const,
  padding: '0 0 28px',
};

const footerText: React.CSSProperties = {
  color: '#2D3748',
  fontSize: '11px',
  lineHeight: '18px',
  margin: '4px 0',
};

const footerLink: React.CSSProperties = {
  color: '#4A5568',
  textDecoration: 'none',
};
