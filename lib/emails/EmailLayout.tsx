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
                  width="36"
                  height="36"
                  style={{ margin: '0 auto 8px', borderRadius: '10px' }}
                />
                <Text style={headerTitle}>Confluence Trading</Text>
                <Text style={headerSubtitle}>Trading Command Center</Text>
              </Column>
            </Row>
          </Section>

          {/* Gradient accent line */}
          <Section style={{ padding: '0 0 16px' }}>
            <div style={gradientLine} />
          </Section>

          {/* Content */}
          {children}

          {/* Open Dashboard CTA */}
          <Section style={{ textAlign: 'center' as const, padding: '8px 0 20px' }}>
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

const body: React.CSSProperties = {
  backgroundColor: '#0d1117',
  fontFamily: 'Inter, Helvetica, Arial, sans-serif',
  margin: 0,
  padding: 0,
};

const container: React.CSSProperties = {
  maxWidth: '600px',
  margin: '0 auto',
  padding: '20px 16px',
};

const header: React.CSSProperties = {
  textAlign: 'center' as const,
  padding: '28px 0 12px',
};

const headerTitle: React.CSSProperties = {
  color: '#ffffff',
  fontSize: '22px',
  fontWeight: 800,
  letterSpacing: '-0.02em',
  margin: '0 0 2px',
};

const headerSubtitle: React.CSSProperties = {
  color: '#8b949e',
  fontSize: '12px',
  fontWeight: 500,
  letterSpacing: '0.04em',
  textTransform: 'uppercase' as const,
  margin: 0,
};

const gradientLine: React.CSSProperties = {
  height: '2px',
  background: 'linear-gradient(90deg, transparent, #F97316, #ea580c, transparent)',
  borderRadius: '1px',
};

const dashboardButton: React.CSSProperties = {
  backgroundColor: '#F97316',
  color: '#ffffff',
  fontSize: '13px',
  fontWeight: 600,
  padding: '10px 28px',
  borderRadius: '8px',
  textDecoration: 'none',
  display: 'inline-block',
};

const divider: React.CSSProperties = {
  borderColor: '#21262d',
  margin: '16px 0',
};

const footer: React.CSSProperties = {
  textAlign: 'center' as const,
  padding: '0 0 24px',
};

const footerText: React.CSSProperties = {
  color: '#484f58',
  fontSize: '11px',
  lineHeight: '18px',
  margin: '4px 0',
};

const footerLink: React.CSSProperties = {
  color: '#F97316',
  textDecoration: 'none',
};
