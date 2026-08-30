import { Section, Text, Row, Column } from '@react-email/components';
import * as React from 'react';
import { EmailLayout } from './EmailLayout';
import type { StructuredAnalysis } from '@/lib/journal-insights';

export interface WeeklyStats {
  netPnL: number;
  wins: number;
  losses: number;
  winRate: number | null; // null when no closed trades
  closedTrades: number;
  entriesCount: number;
  bestTrade: { symbol: string; pnl: number } | null;
  worstTrade: { symbol: string; pnl: number } | null;
}

/** Compact long-term portfolio recap appended to the weekly trading recap. */
export interface PortfolioRecap {
  totalValue: number | null;
  weekChange: number | null;
  openPnl: number;
  positionsCount: number;
  dividends30d: number;
  keyTakeaway: string | null;
  /** Pressing items pulled from the weekly portfolio review (repositioning + watch). */
  actionItems: string[];
}

export interface WeeklyJournalInsightsEmailProps {
  periodLabel: string;
  dateRangeLabel: string;
  stats: WeeklyStats;
  structured: StructuredAnalysis | null;
  rawAnalysis: string;
  /** Rendered only when a long-term portfolio is connected. */
  portfolio?: PortfolioRecap | null;
}

const GREEN = '#22C55E';
const RED = '#EF4444';

function money(n: number): string {
  const sign = n < 0 ? '-' : n > 0 ? '+' : '';
  return `${sign}$${Math.abs(n).toFixed(2)}`;
}

function bigMoney(n: number | null): string {
  return n == null
    ? '—'
    : `$${n.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}

export function WeeklyJournalInsightsEmail({
  periodLabel,
  dateRangeLabel,
  stats,
  structured,
  rawAnalysis,
  portfolio,
}: WeeklyJournalInsightsEmailProps) {
  const pnlColor = stats.netPnL > 0 ? GREEN : stats.netPnL < 0 ? RED : '#A0AEC0';

  return (
    <EmailLayout previewText={`Weekly journal insights — ${periodLabel}`}>
      <Section style={card}>
        <Text style={kicker}>Weekly Journal Insights</Text>
        <Text style={title}>{periodLabel}</Text>
        <Text style={subtitle}>{dateRangeLabel}</Text>
      </Section>

      {/* Stats row */}
      <Section style={card}>
        <Row>
          <Column style={statCol}>
            <Text style={statLabel}>Net P&amp;L</Text>
            <Text style={{ ...statValue, color: pnlColor }}>{money(stats.netPnL)}</Text>
          </Column>
          <Column style={statCol}>
            <Text style={statLabel}>Record</Text>
            <Text style={statValue}>
              {stats.wins}W / {stats.losses}L
            </Text>
          </Column>
          <Column style={statCol}>
            <Text style={statLabel}>Win Rate</Text>
            <Text style={statValue}>
              {stats.winRate === null ? '—' : `${Math.round(stats.winRate * 100)}%`}
            </Text>
          </Column>
          <Column style={statCol}>
            <Text style={statLabel}>Journal Entries</Text>
            <Text style={statValue}>{stats.entriesCount}</Text>
          </Column>
        </Row>
        {(stats.bestTrade || stats.worstTrade) && (
          <Row>
            <Column>
              <Text style={bestWorst}>
                {stats.bestTrade && (
                  <>
                    Best: <span style={{ color: GREEN }}>{stats.bestTrade.symbol} {money(stats.bestTrade.pnl)}</span>
                  </>
                )}
                {stats.bestTrade && stats.worstTrade && ' · '}
                {stats.worstTrade && (
                  <>
                    Worst: <span style={{ color: RED }}>{stats.worstTrade.symbol} {money(stats.worstTrade.pnl)}</span>
                  </>
                )}
              </Text>
            </Column>
          </Row>
        )}
      </Section>

      {structured ? (
        <>
          {/* Key takeaway */}
          <Section style={takeawayCard}>
            <Text style={sectionHeading}>Key Takeaway</Text>
            <Text style={takeawayText}>{structured.keyTakeaway}</Text>
          </Section>

          <InsightSection title="What's Working" items={structured.strengths} accent={GREEN} />
          <InsightSection title="Areas to Improve" items={structured.improvements} accent="#FF8C38" />
          {structured.patterns && structured.patterns.length > 0 && (
            <InsightSection title="Patterns Noticed" items={structured.patterns} accent="#818CF8" />
          )}
        </>
      ) : (
        <Section style={card}>
          <Text style={sectionHeading}>Analysis</Text>
          <Text style={bulletText}>{rawAnalysis}</Text>
        </Section>
      )}

      {portfolio && (
        <>
          <Section style={card}>
            <Text style={kicker}>Long-term Portfolio</Text>
            <Row>
              <Column style={statCol}>
                <Text style={statLabel}>Total Value</Text>
                <Text style={statValue}>{bigMoney(portfolio.totalValue)}</Text>
              </Column>
              <Column style={statCol}>
                <Text style={statLabel}>Past Week</Text>
                <Text
                  style={{
                    ...statValue,
                    color:
                      (portfolio.weekChange ?? 0) > 0
                        ? GREEN
                        : (portfolio.weekChange ?? 0) < 0
                          ? RED
                          : '#A0AEC0',
                  }}
                >
                  {portfolio.weekChange == null ? '—' : money(portfolio.weekChange)}
                </Text>
              </Column>
              <Column style={statCol}>
                <Text style={statLabel}>Unrealized P&amp;L</Text>
                <Text
                  style={{
                    ...statValue,
                    color: portfolio.openPnl > 0 ? GREEN : portfolio.openPnl < 0 ? RED : '#A0AEC0',
                  }}
                >
                  {money(portfolio.openPnl)}
                </Text>
              </Column>
              <Column style={statCol}>
                <Text style={statLabel}>Holdings</Text>
                <Text style={statValue}>{portfolio.positionsCount}</Text>
              </Column>
            </Row>
            <Row>
              <Column>
                <Text style={bestWorst}>
                  Dividends last 30d ${portfolio.dividends30d.toFixed(2)}
                </Text>
              </Column>
            </Row>
            {portfolio.keyTakeaway && (
              <Text style={{ ...bulletText, marginTop: '12px', marginBottom: 0 }}>
                {portfolio.keyTakeaway}
              </Text>
            )}
          </Section>
          {portfolio.actionItems.length > 0 && (
            <InsightSection
              title="Portfolio — Action Items"
              items={portfolio.actionItems}
              accent="#4DA6FF"
            />
          )}
        </>
      )}
    </EmailLayout>
  );
}

function InsightSection({
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

/* ------------------------------------------------------------------ */
/*  Styles — Dark Precision palette                                    */
/* ------------------------------------------------------------------ */

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
  margin: '0 0 2px',
};

const subtitle: React.CSSProperties = {
  color: '#4A5568',
  fontSize: '12px',
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

const bestWorst: React.CSSProperties = {
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
