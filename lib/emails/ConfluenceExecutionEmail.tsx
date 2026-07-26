import { Section, Text } from '@react-email/components';
import * as React from 'react';
import { EmailLayout } from './EmailLayout';

/**
 * Bot-execution report — sent to the owner when the ConfluenceTrading
 * automation acts without a human in the loop: orders filled at the broker,
 * take-profits placed on target hits, entries auto-expired, or anything that
 * left a position unprotected. Same Dark Precision palette as the Market
 * Briefing email.
 */

export type ExecutionEventTone = 'fill' | 'action' | 'warn';

export interface ExecutionEmailEvent {
  /** e.g. "BMY take-profit FILLED" */
  headline: string;
  /** e.g. "Sold 12 @ $61.50 (limit $61.50, live)" */
  detail?: string;
  tone: ExecutionEventTone;
}

export interface ConfluenceExecutionEmailProps {
  /** Human date/time header, e.g. "Jul 27, 2026, 10:30 AM ET". */
  generatedAt: string;
  events: ExecutionEmailEvent[];
  paperMode: boolean;
}

const TONE_COLOR: Record<ExecutionEventTone, string> = {
  fill: '#22C55E',
  action: '#FF8C38',
  warn: '#F87171',
};

export function ConfluenceExecutionEmail({ generatedAt, events, paperMode }: ConfluenceExecutionEmailProps) {
  return (
    <EmailLayout previewText={`Confluence bot activity: ${events.map((e) => e.headline).join('; ')}`}>
      <Section style={card}>
        <Text style={title}>Agent Execution Report</Text>
        <Text style={subtitle}>
          {generatedAt}
          {paperMode ? ' · PAPER MODE' : ''}
        </Text>
        {events.map((e, i) => (
          <Section key={i} style={eventRow}>
            <Text style={{ ...eventHeadline, color: TONE_COLOR[e.tone] }}>{e.headline}</Text>
            {e.detail ? <Text style={eventDetail}>{e.detail}</Text> : null}
          </Section>
        ))}
        <Text style={footnote}>
          Automated exits (protective stops, take-profits) complete the plan you approved at entry. Review the
          full trail in Agents → Audit Log.
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
  color: '#EEF2F7',
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

const eventRow: React.CSSProperties = {
  borderTop: '1px solid rgba(255,255,255,0.05)',
  padding: '10px 0',
};

const eventHeadline: React.CSSProperties = {
  fontSize: '14px',
  fontWeight: 600,
  margin: '0 0 2px',
};

const eventDetail: React.CSSProperties = {
  color: '#94A3B8',
  fontSize: '12px',
  lineHeight: '18px',
  margin: 0,
};

const footnote: React.CSSProperties = {
  color: '#4A5568',
  fontSize: '11px',
  lineHeight: '17px',
  margin: '14px 0 0',
};
