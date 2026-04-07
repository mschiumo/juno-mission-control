import {
  Section,
  Text,
  Link,
  Row,
  Column,
} from '@react-email/components';
import * as React from 'react';
import { EmailLayout } from './EmailLayout';

interface GapStock {
  symbol: string;
  price: number;
  gapPercent: number;
  volume: number;
  marketCap?: number;
}

interface GapScannerEmailProps {
  date?: string;
  gainers: GapStock[];
  losers: GapStock[];
  scanned?: number;
  marketSession?: string;
}

/* ------------------------------------------------------------------ */
/*  Design tokens — Dark Precision palette                             */
/* ------------------------------------------------------------------ */

const P = {
  bgBase:        '#050709',
  surface1:      '#0a0e15',
  borderSubtle:  'rgba(255,255,255,0.04)',
  borderDefault: 'rgba(255,255,255,0.08)',
  accent:        '#FF6B00',
  positive:      '#00C896',
  positiveDim:   'rgba(0,200,150,0.1)',
  negative:      '#FF3D57',
  negativeDim:   'rgba(255,61,87,0.1)',
  warning:       '#F5A623',
  warningDim:    'rgba(245,166,35,0.1)',
  textPrimary:   '#EEF2F7',
  textSecondary: '#7E8CA0',
  textTertiary:  '#4A5568',
  info:          '#4DA6FF',
} as const;

function formatVolume(vol: number): string {
  if (vol >= 1_000_000) return `${(vol / 1_000_000).toFixed(1)}M`;
  if (vol >= 1_000) return `${(vol / 1_000).toFixed(0)}K`;
  return vol.toString();
}

function formatMarketCap(cap: number | undefined): string {
  if (!cap) return '-';
  if (cap >= 1_000_000_000) return `$${(cap / 1_000_000_000).toFixed(1)}B`;
  if (cap >= 1_000_000) return `$${(cap / 1_000_000).toFixed(0)}M`;
  return `$${cap.toLocaleString()}`;
}

/* ------------------------------------------------------------------ */
/*  Gap row                                                            */
/* ------------------------------------------------------------------ */

function GapRow({ stock, maxGap, color, barBg, dimBg }: {
  stock: GapStock; maxGap: number; color: string; barBg: string; dimBg: string;
}) {
  const absGap = Math.abs(stock.gapPercent);
  const barWidth = maxGap > 0 ? Math.round((absGap / maxGap) * 100) : 0;
  const sign = stock.gapPercent >= 0 ? '+' : '';
  const rowBg = stock.gapPercent >= 0 ? 'rgba(0,200,150,0.03)' : 'rgba(255,61,87,0.03)';

  return (
    <Row style={{ ...tableRow, backgroundColor: rowBg }}>
      <Column style={{ width: '22%', verticalAlign: 'middle' as const, paddingLeft: '10px' }}>
        <Link href={`https://www.tradingview.com/chart/?symbol=${stock.symbol}`} style={symbolLink}>
          {stock.symbol}
        </Link>
      </Column>
      <Column style={{ width: '18%', textAlign: 'right' as const, verticalAlign: 'middle' as const }}>
        <Text style={{ ...gapText, color, backgroundColor: dimBg, borderRadius: '5px', padding: '2px 8px' }}>
          {sign}{stock.gapPercent.toFixed(1)}%
        </Text>
      </Column>
      <Column style={{ width: '20%', verticalAlign: 'middle' as const, paddingLeft: '10px' }}>
        <div style={barTrack}>
          <div style={{ ...barFill, width: `${barWidth}%`, backgroundColor: barBg }} />
        </div>
      </Column>
      <Column style={{ width: '18%', textAlign: 'right' as const, verticalAlign: 'middle' as const }}>
        <Text style={priceText}>${stock.price.toFixed(2)}</Text>
      </Column>
      <Column style={{ width: '12%', textAlign: 'right' as const, verticalAlign: 'middle' as const }}>
        <Text style={volText}>{formatVolume(stock.volume)}</Text>
      </Column>
      <Column style={{ width: '10%', textAlign: 'right' as const, verticalAlign: 'middle' as const, paddingRight: '10px' }}>
        <Text style={volText}>{formatMarketCap(stock.marketCap)}</Text>
      </Column>
    </Row>
  );
}

/* ------------------------------------------------------------------ */
/*  Gap table                                                          */
/* ------------------------------------------------------------------ */

function GapTable({ stocks, title, icon, color, barBg, dimBg }: {
  stocks: GapStock[]; title: string; icon: string; color: string; barBg: string; dimBg: string;
}) {
  if (stocks.length === 0) return null;
  const top10 = stocks.slice(0, 10);
  const maxGap = Math.max(...top10.map(s => Math.abs(s.gapPercent)), 1);

  return (
    <Section style={card}>
      <Row style={sectionHeaderRow}>
        <Column>
          <Text style={{ ...sectionTitle, color }}>
            <span style={{ marginRight: '7px', fontSize: '14px' }}>{icon}</span>{title}
          </Text>
        </Column>
      </Row>
      <Row style={headerRow}>
        <Column style={{ width: '22%', paddingLeft: '10px' }}><Text style={colHeader}>Symbol</Text></Column>
        <Column style={{ width: '18%', textAlign: 'right' as const }}><Text style={colHeader}>Gap</Text></Column>
        <Column style={{ width: '20%', paddingLeft: '10px' }}><Text style={colHeader}></Text></Column>
        <Column style={{ width: '18%', textAlign: 'right' as const }}><Text style={colHeader}>Price</Text></Column>
        <Column style={{ width: '12%', textAlign: 'right' as const }}><Text style={colHeader}>Vol</Text></Column>
        <Column style={{ width: '10%', textAlign: 'right' as const, paddingRight: '10px' }}><Text style={colHeader}>Cap</Text></Column>
      </Row>
      {top10.map((stock) => (
        <GapRow key={stock.symbol} stock={stock} maxGap={maxGap} color={color} barBg={barBg} dimBg={dimBg} />
      ))}
    </Section>
  );
}

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */

export function GapScannerEmail({ date, gainers, losers, scanned, marketSession }: GapScannerEmailProps) {
  const displayDate = date || new Date().toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
  });
  const totalGappers = gainers.length + losers.length;
  const gainerPct = totalGappers > 0 ? Math.round((gainers.length / totalGappers) * 100) : 50;

  return (
    <EmailLayout previewText={`Gap Scan ${displayDate} — ${gainers.length} gainers, ${losers.length} losers`}>
      {/* Header card */}
      <Section style={card}>
        <Row>
          <Column style={{ verticalAlign: 'middle' as const }}>
            <Text style={dateTextStyle}>Pre-Market Gap Scan</Text>
            <Text style={dateSubtext}>{displayDate}</Text>
          </Column>
          <Column style={{ width: '130px', textAlign: 'right' as const, verticalAlign: 'middle' as const }}>
            <Text style={sessionBadge}>{marketSession || 'Pre-Market'}</Text>
          </Column>
        </Row>
        <Section style={{ padding: '14px 0 0' }}>
          <Row>
            <Column>
              <Text style={summaryStats}>
                <span style={{ color: P.positive, fontWeight: 700 }}>{gainers.length}</span>
                <span style={{ color: P.textTertiary }}> gapping up</span>
                {'  ·  '}
                <span style={{ color: P.negative, fontWeight: 700 }}>{losers.length}</span>
                <span style={{ color: P.textTertiary }}> gapping down</span>
                {scanned ? (
                  <>{'  ·  '}<span style={{ color: P.textTertiary }}>{scanned.toLocaleString()} scanned</span></>
                ) : null}
              </Text>
              <div style={heatBarTrack}>
                <div style={{ ...heatBarFillGreen, width: `${gainerPct}%` }} />
              </div>
            </Column>
          </Row>
        </Section>
      </Section>

      <GapTable stocks={gainers} title="Top Gainers" icon="🟢" color={P.positive} barBg={P.positive} dimBg={P.positiveDim} />
      <GapTable stocks={losers} title="Top Losers" icon="🔴" color={P.negative} barBg={P.negative} dimBg={P.negativeDim} />
    </EmailLayout>
  );
}

export default GapScannerEmail;

/* ------------------------------------------------------------------ */
/*  Styles                                                             */
/* ------------------------------------------------------------------ */

const card: React.CSSProperties = {
  background: `linear-gradient(135deg, rgba(255,255,255,0.025) 0%, transparent 60%), ${P.surface1}`,
  border: `1px solid ${P.borderDefault}`,
  borderRadius: '14px',
  padding: '20px 24px',
  marginBottom: '12px',
  boxShadow: '0 4px 24px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.02)',
};

const dateTextStyle: React.CSSProperties = {
  color: P.textPrimary,
  fontSize: '22px',
  fontWeight: 800,
  letterSpacing: '-0.02em',
  margin: 0,
};

const dateSubtext: React.CSSProperties = {
  color: P.textSecondary,
  fontSize: '13px',
  fontWeight: 500,
  margin: '3px 0 0',
};

const sessionBadge: React.CSSProperties = {
  display: 'inline-block',
  fontSize: '12px',
  fontWeight: 700,
  padding: '6px 16px',
  borderRadius: '8px',
  margin: 0,
  letterSpacing: '0.03em',
  color: P.warning,
  backgroundColor: P.warningDim,
  border: `1px solid ${P.warning}40`,
};

const summaryStats: React.CSSProperties = {
  fontSize: '12px',
  margin: '0 0 7px',
  lineHeight: '18px',
};

const heatBarTrack: React.CSSProperties = {
  height: '4px',
  backgroundColor: P.negativeDim,
  borderRadius: '2px',
  overflow: 'hidden',
};

const heatBarFillGreen: React.CSSProperties = {
  height: '4px',
  backgroundColor: P.positive,
  borderRadius: '2px',
};

const sectionHeaderRow: React.CSSProperties = {
  padding: '0 0 10px',
  borderBottom: `1px solid ${P.borderSubtle}`,
  marginBottom: '4px',
};

const sectionTitle: React.CSSProperties = {
  fontSize: '11px',
  fontWeight: 700,
  textTransform: 'uppercase' as const,
  letterSpacing: '0.08em',
  margin: 0,
};

const headerRow: React.CSSProperties = {
  borderBottom: `1px solid ${P.borderDefault}`,
  padding: '8px 0 6px',
};

const colHeader: React.CSSProperties = {
  color: P.textTertiary,
  fontSize: '10px',
  fontWeight: 600,
  textTransform: 'uppercase' as const,
  letterSpacing: '0.06em',
  margin: 0,
};

const tableRow: React.CSSProperties = {
  borderBottom: `1px solid ${P.borderSubtle}`,
  padding: '8px 0',
};

const symbolLink: React.CSSProperties = {
  color: P.info,
  fontSize: '13px',
  fontWeight: 700,
  textDecoration: 'none',
};

const gapText: React.CSSProperties = {
  fontSize: '12px',
  fontWeight: 700,
  margin: 0,
};

const barTrack: React.CSSProperties = {
  height: '4px',
  backgroundColor: P.borderSubtle,
  borderRadius: '2px',
  overflow: 'hidden',
};

const barFill: React.CSSProperties = {
  height: '4px',
  borderRadius: '2px',
};

const priceText: React.CSSProperties = {
  color: P.textPrimary,
  fontSize: '13px',
  fontWeight: 500,
  margin: 0,
};

const volText: React.CSSProperties = {
  color: P.textSecondary,
  fontSize: '11px',
  margin: 0,
};
