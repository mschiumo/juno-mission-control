import { Button, Section, Text } from '@react-email/components';
import * as React from 'react';
import { EmailLayout } from './EmailLayout';

const CONSOLE_BILLING_URL = 'https://console.anthropic.com/settings/billing';

/**
 * AI failure alert — sent when a report that calls Claude fails.
 *
 * Written to be actionable from the phone: what broke, which kind of failure
 * it is, the provider's own error, and the one next step. The Sep 2026
 * out-of-credits outage is the case this exists for: every AI report in the
 * app failed and nothing said so out loud.
 */
export interface AiFailureAlertEmailProps {
  /** e.g. "Anthropic credits are exhausted". */
  headline: string;
  /** Billing/auth/config problems are red; transient provider blips are amber. */
  severe: boolean;
  /** The one concrete next step. */
  hint: string;
  /** The feature that triggered this alert. */
  feature: string;
  /** Every feature that hit this failure while the alert was throttled. */
  affected: string[];
  /** How many failures this alert covers. */
  failureCount: number;
  /** The provider's own error text. */
  error: string;
  /** Human date/time header, e.g. "Sep 9, 2026, 3:41 PM ET". */
  generatedAt: string;
  /** One line explaining the de-duplication behaviour. */
  throttleNote: string;
}

export function AiFailureAlertEmail({
  headline,
  severe,
  hint,
  feature,
  affected,
  failureCount,
  error,
  generatedAt,
  throttleNote,
}: AiFailureAlertEmailProps) {
  const accent = severe ? '#F87171' : '#FBBF24';
  return (
    <EmailLayout previewText={`${headline} — ${feature}`}>
      <Section style={card}>
        <Text style={{ ...title, color: accent }}>{headline}</Text>
        <Text style={subtitle}>{generatedAt}</Text>

        <Text style={body}>
          {severe ? (
            <>
              AI reports are failing and will keep failing until this is fixed. Journal Insights, the
              journal and portfolio reports, and the AI sections of the market emails are all affected.
            </>
          ) : (
            <>
              An AI report failed. This kind of failure is usually transient — no action may be needed,
              but here is what happened.
            </>
          )}
        </Text>

        <Section style={row}>
          <Text style={label}>Triggered by</Text>
          <Text style={value}>{feature}</Text>
        </Section>

        <Section style={row}>
          <Text style={label}>Failures since the last alert</Text>
          <Text style={value}>
            {failureCount}
            {affected.length > 1 ? ` · across ${affected.join(', ')}` : ''}
          </Text>
        </Section>

        <Section style={row}>
          <Text style={label}>Provider error</Text>
          <Text style={mono}>{error}</Text>
        </Section>

        <Section style={row}>
          <Text style={label}>What to do</Text>
          <Text style={body}>{hint}</Text>
        </Section>

        {severe ? (
          <Section style={{ textAlign: 'center' as const, padding: '16px 0 4px' }}>
            <Button href={CONSOLE_BILLING_URL} style={{ ...actionButton, backgroundColor: accent }}>
              Open Anthropic Console billing
            </Button>
            <Text style={footnote}>
              Check that the organization shown is the one that owns the app’s API key — credit
              balances are per-organization.
            </Text>
          </Section>
        ) : null}

        <Text style={footnote}>{throttleNote}</Text>
      </Section>
    </EmailLayout>
  );
}

/* ------------------------------------------------------------------ */
/*  Styles — Dark Precision palette, matching the health alert         */
/* ------------------------------------------------------------------ */

const card: React.CSSProperties = {
  backgroundColor: '#0B0F14',
  border: '1px solid rgba(255,255,255,0.06)',
  borderRadius: '12px',
  padding: '20px 22px',
  marginBottom: '16px',
};

const title: React.CSSProperties = {
  fontSize: '18px',
  fontWeight: 700,
  letterSpacing: '-0.01em',
  margin: '0 0 2px',
};

const subtitle: React.CSSProperties = {
  color: '#4A5568',
  fontSize: '11px',
  fontWeight: 500,
  letterSpacing: '0.08em',
  textTransform: 'uppercase' as const,
  margin: '0 0 14px',
};

const body: React.CSSProperties = {
  color: '#CBD5E1',
  fontSize: '13px',
  lineHeight: '20px',
  margin: '0 0 4px',
};

const row: React.CSSProperties = {
  borderTop: '1px solid rgba(255,255,255,0.05)',
  padding: '10px 0 2px',
};

const label: React.CSSProperties = {
  color: '#4A5568',
  fontSize: '10px',
  fontWeight: 600,
  letterSpacing: '0.09em',
  textTransform: 'uppercase' as const,
  margin: '0 0 4px',
};

const value: React.CSSProperties = {
  color: '#E2E8F0',
  fontSize: '13px',
  fontWeight: 600,
  lineHeight: '19px',
  margin: 0,
};

const mono: React.CSSProperties = {
  color: '#94A3B8',
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  fontSize: '11.5px',
  lineHeight: '17px',
  margin: 0,
  wordBreak: 'break-word' as const,
};

const footnote: React.CSSProperties = {
  color: '#4A5568',
  fontSize: '11px',
  lineHeight: '17px',
  margin: '14px 0 0',
};

const actionButton: React.CSSProperties = {
  borderRadius: '8px',
  color: '#0B0F14',
  display: 'inline-block',
  fontSize: '13px',
  fontWeight: 700,
  padding: '10px 22px',
  textDecoration: 'none',
};
