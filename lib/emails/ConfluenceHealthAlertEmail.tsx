import { Button, Section, Text } from '@react-email/components';
import * as React from 'react';
import { EmailLayout } from './EmailLayout';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://confluencetrading.app';

/**
 * Broker-connection alert — sent when the agentic rail stops working, once a
 * day while it stays broken, and once when it comes back.
 *
 * Written to be actionable from the phone: what broke, how long it has been
 * broken, the broker's own error, and the specific next step. The Aug 2026
 * outage was invisible for four days precisely because nothing said any of
 * this. Same Dark Precision palette as the execution report.
 */

export type HealthAlertKind = 'down' | 'still_down' | 'recovered';

export interface ConfluenceHealthAlertEmailProps {
  kind: HealthAlertKind;
  /** Human date/time header, e.g. "Aug 18, 2026, 8:30 AM ET". */
  generatedAt: string;
  /** The broker's own failure message (absent on recovery). */
  error?: string;
  /** The next concrete action, when the failure is recognised. */
  hint?: string;
  /** e.g. "4 days, 2 hours" — how long it has been down. */
  downtime?: string;
  /** Which credential path is live, e.g. "refresh (client id set, token from redis)". */
  authSummary?: string;
  /** Set when the most recent screen also failed. */
  lastRunError?: string;
}

const ACCENT: Record<HealthAlertKind, string> = {
  down: '#F87171',
  still_down: '#F87171',
  recovered: '#22C55E',
};

const HEADLINE: Record<HealthAlertKind, string> = {
  down: 'Robinhood connection is DOWN',
  still_down: 'Robinhood connection is STILL down',
  recovered: 'Robinhood connection restored',
};

export function ConfluenceHealthAlertEmail({
  kind,
  generatedAt,
  error,
  hint,
  downtime,
  authSummary,
  lastRunError,
}: ConfluenceHealthAlertEmailProps) {
  const recovered = kind === 'recovered';
  return (
    <EmailLayout previewText={HEADLINE[kind]}>
      <Section style={card}>
        <Text style={{ ...title, color: ACCENT[kind] }}>{HEADLINE[kind]}</Text>
        <Text style={subtitle}>{generatedAt}</Text>

        {recovered ? (
          <Text style={body}>
            The agentic rail is answering again{downtime ? ` after ${downtime} down` : ''}. Screens and
            approvals should work normally — worth running a screen to confirm.
          </Text>
        ) : (
          <Text style={body}>
            The agent cannot reach Robinhood{downtime ? `, and hasn’t for ${downtime}` : ''}. Screens will
            fail and approvals will not place orders until this clears — <b>trades are being missed</b>.
          </Text>
        )}

        {error ? (
          <Section style={row}>
            <Text style={label}>Broker error</Text>
            <Text style={mono}>{error}</Text>
          </Section>
        ) : null}

        {lastRunError ? (
          <Section style={row}>
            <Text style={label}>Last screen also failed</Text>
            <Text style={mono}>{lastRunError}</Text>
          </Section>
        ) : null}

        {authSummary ? (
          <Section style={row}>
            <Text style={label}>Credential path</Text>
            <Text style={mono}>{authSummary}</Text>
          </Section>
        ) : null}

        {hint ? (
          <Section style={row}>
            <Text style={label}>What to do</Text>
            <Text style={body}>{hint}</Text>
          </Section>
        ) : null}

        {!recovered ? (
          <Section style={{ textAlign: 'center' as const, padding: '16px 0 4px' }}>
            <Button href={`${APP_URL}/api/confluence/robinhood/oauth/start`} style={reconnectButton}>
              Reconnect Robinhood
            </Button>
            <Text style={footnote}>
              Sign in to Robinhood and approve — about a minute. The app registers itself and stores the
              new credentials; no terminal, no env edits.
            </Text>
          </Section>
        ) : null}

        <Text style={footnote}>
          Checked automatically twice a day, every day. Full detail at
          /api/confluence/robinhood/health.
        </Text>
      </Section>
    </EmailLayout>
  );
}

/* ------------------------------------------------------------------ */
/*  Styles — Dark Precision palette                                    */
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

const reconnectButton: React.CSSProperties = {
  backgroundColor: '#F87171',
  borderRadius: '8px',
  color: '#0B0F14',
  display: 'inline-block',
  fontSize: '13px',
  fontWeight: 700,
  padding: '10px 22px',
  textDecoration: 'none',
};
