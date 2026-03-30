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
            url: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap',
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
            <Text style={headerTitle}>Confluence Trading</Text>
            <Text style={headerSubtitle}>Your disciplined trading command center</Text>
          </Section>

          {/* Content */}
          {children}

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
              <Link href={APP_URL} style={footerLink}>
                Open Confluence Trading
              </Link>
              {' | '}
              <Link href={`${APP_URL}/profile`} style={footerLink}>
                Manage Preferences
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
  padding: '20px',
};

const header: React.CSSProperties = {
  textAlign: 'center' as const,
  padding: '24px 0 16px',
};

const headerTitle: React.CSSProperties = {
  color: '#ffffff',
  fontSize: '24px',
  fontWeight: 700,
  margin: '0 0 4px',
};

const headerSubtitle: React.CSSProperties = {
  color: '#8b949e',
  fontSize: '13px',
  margin: 0,
};

const divider: React.CSSProperties = {
  borderColor: '#30363d',
  margin: '24px 0',
};

const footer: React.CSSProperties = {
  textAlign: 'center' as const,
  padding: '0 0 24px',
};

const footerText: React.CSSProperties = {
  color: '#8b949e',
  fontSize: '12px',
  lineHeight: '20px',
  margin: '4px 0',
};

const footerLink: React.CSSProperties = {
  color: '#F97316',
  textDecoration: 'underline',
};
