import { Section, Text, Row, Column } from '@react-email/components';
import * as React from 'react';
import { EmailLayout } from './EmailLayout';
import type { StructuredReview } from '@/lib/portfolio-review';

export interface PortfolioEmailStats {
  totalValue: number | null;
  weekChange: number | null;
  openPnl: number;
  cash: number | null;
  positionsCount: number;
  dividends30d: number;
}

export interface TopHolding {
  symbol: string;
  weight: number;
  marketValue: number;
  openPnl: number | null;
}

export interface WeeklyPortfolioReviewEmailProps {
  periodLabel: string;
  stats: PortfolioEmailStats;
  topHoldings: TopHolding[];
  structured: StructuredReview | null;
  rawAnalysis: string;
}

const GREEN = '#22C55E';
const RED = '#EF4444';

function money(n: number): string {
  const sign = n < 0 ? '-' : n > 0 ? '+' : '';
  return `${sign}$${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function value(n: number | null): string {
  return n == null
    ? '—'
    : `$${n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

export function WeeklyPortfolioReviewEmail({
  periodLabel,
  stats,
  topHoldings,
  structured,
  rawAnalysis,
}: WeeklyPortfolioReviewEmailProps) {
  const changeColor =
    (stats.weekChange ?? 0) > 0 ? GREEN : (stats.weekChange ?? 0) < 0 ? RED : '#A0AEC0';
  const pnlColor = stats.openPnl > 0 ? GREEN : stats.openPnl < 0 ? RED : '#A0AEC0';

  return (
    <EmailLayout
      previewText={`Weekly portfolio review — ${periodLabel}`}
      footerReason="You're receiving this because the weekly portfolio review is enabled for your account."
    >
      <Section style={card}>
        <Text style={kicker}>Weekly Portfolio Review</Text>
        <Text style={title}>{periodLabel}</Text>
      </Section>

      <Section style={card}>
        <Row>
          <Column style={statCol}>
            <Text style={statLabel}>Total Value</Text>
            <Text style={statValue}>{value(stats.totalValue)}</Text>
          </Column>
          <Column style={statCol}>
            <Text style={statLabel}>Past Week</Text>
            <Text style={{ ...statValue, color: changeColor }}>
              {stats.weekChange == null ? '—' : money(stats.weekChange)}
            </Text>
          </Column>
          <Column style={statCol}>
            <Text style={statLabel}>Unrealized P&amp;L</Text>
            <Text style={{ ...statValue, color: pnlColor }}>{money(stats.openPnl)}</Text>
          </Column>
          <Column style={statCol}>
            <Text style={statLabel}>Holdings</Text>
            <Text style={statValue}>{stats.positionsCount}</Text>
          </Column>
        </Row>
        <Row>
          <Column>
            <Text style={subline}>
              Cash {value(stats.cash)} · Dividends last 30d $
              {stats.dividends30d.toFixed(2)}
            </Text>
          </Column>
        </Row>
      </Section>

      {topHoldings.length > 0 && (
        <Section style={card}>
          <Text style={sectionHeading}>Top Holdings</Text>
          {topHoldings.map(h => (
            <Text key={h.symbol} style={holdingRow}>
              <span style={{ color: '#EEF2F7', fontWeight: 600 }}>{h.symbol}</span>
              {'  '}·{'  '}
              {h.weight}% · {value(h.marketValue)}
              {h.openPnl != null && (
                <span style={{ color: h.openPnl >= 0 ? GREEN : RED }}>
                  {'  '}
                  {money(h.openPnl)}
                </span>
              )}
            </Text>
          ))}
        </Section>
      )}

      {structured ? (
        <>
          <Section style={takeawayCard}>
            <Text style={sectionHeading}>Key Takeaway</Text>
            <Text style={takeawayText}>{structured.keyTakeaway}</Text>
          </Section>
          <ReviewSection title="Portfolio Health" items={structured.health} accent="#4DA6FF" />
          <ReviewSection title="Worth a Closer Look" items={structured.repositioning} accent="#FF8C38" />
          {structured.watch.length > 0 && (
            <ReviewSection title="Watching Next Week" items={structured.watch} accent="#818CF8" />
          )}
        </>
      ) : (
        <Section style={card}>
          <Text style={sectionHeading}>Analysis</Text>
          <Text style={bulletText}>{rawAnalysis}</Text>
        </Section>
      )}

      <Section>
        <Text style={disclaimer}>
          Automated analysis of your own account data, for your personal review.
          Not financial advice.
        </Text>
      </Section>
    </EmailLayout>
  );
}

function ReviewSection({
  title,
  items,
  accent,
}: {
  title: string;
  items: string[];
  accent: string;
}) {
  return (
    <Section style={card}>
      <Text style={{ ...sectionHeading, color: accent }}>{title}</Text>
      {items.map((item, i) => (
        <Text key={i} style={bulletText}>
          <span style={{ color: accent }}>•</span>&nbsp;&nbsp;{item}
        </Text>
      ))}
    </Section>
  );
}

/* Styles — Dark Precision palette (matches WeeklyJournalInsightsEmail) */

const card: React.CSSProperties = {
  backgroundColor: '#0B0F14',
  border: '1px solid rgba(255,255,255,0.06)',
  borderRadius: '12px',
  padding: '20px 24px',
  marginBottom: '14px',
};

const takeawayCard: React.CSSProperties = {
  ...card,
  border: '1px solid rgba(255,107,0,0.35)',
  backgroundColor: 'rgba(255,107,0,0.06)',
};

const kicker: React.CSSProperties = {
  color: '#FF8C38',
  fontSize: '11px',
  fontWeight: 600,
  letterSpacing: '0.1em',
  textTransform: 'uppercase' as const,
  margin: '0 0 4px',
};

const title: React.CSSProperties = {
  color: '#EEF2F7',
  fontSize: '20px',
  fontWeight: 700,
  margin: 0,
};

const statCol: React.CSSProperties = {
  textAlign: 'center' as const,
  verticalAlign: 'top',
};

const statLabel: React.CSSProperties = {
  color: '#4A5568',
  fontSize: '10px',
  fontWeight: 600,
  letterSpacing: '0.08em',
  textTransform: 'uppercase' as const,
  margin: '0 0 4px',
};

const statValue: React.CSSProperties = {
  color: '#EEF2F7',
  fontSize: '16px',
  fontWeight: 700,
  margin: 0,
};

const subline: React.CSSProperties = {
  color: '#A0AEC0',
  fontSize: '12px',
  textAlign: 'center' as const,
  margin: '14px 0 0',
};

const sectionHeading: React.CSSProperties = {
  color: '#EEF2F7',
  fontSize: '12px',
  fontWeight: 700,
  letterSpacing: '0.06em',
  textTransform: 'uppercase' as const,
  margin: '0 0 10px',
};

const holdingRow: React.CSSProperties = {
  color: '#A0AEC0',
  fontSize: '13px',
  lineHeight: '21px',
  margin: '0 0 6px',
};

const takeawayText: React.CSSProperties = {
  color: '#EEF2F7',
  fontSize: '14px',
  lineHeight: '22px',
  margin: 0,
};

const bulletText: React.CSSProperties = {
  color: '#A0AEC0',
  fontSize: '13px',
  lineHeight: '21px',
  margin: '0 0 8px',
  whiteSpace: 'pre-wrap' as const,
};

const disclaimer: React.CSSProperties = {
  color: '#4A5568',
  fontSize: '11px',
  lineHeight: '17px',
  textAlign: 'center' as const,
  margin: '4px 0 0',
};
