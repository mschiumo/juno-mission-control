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
/*  Gap row with inline bar showing gap magnitude                      */
/* ------------------------------------------------------------------ */

function GapRow({ stock, maxGap, color, barBg }: {
  stock: GapStock;
  maxGap: number;
  color: string;
  barBg: string;
}) {
  const absGap = Math.abs(stock.gapPercent);
  const barWidth = maxGap > 0 ? Math.round((absGap / maxGap) * 100) : 0;
  const sign = stock.gapPercent >= 0 ? '+' : '';
  const rowBg = stock.gapPercent >= 0 ? 'rgba(63,185,80,0.04)' : 'rgba(248,81,73,0.04)';

  return (
    <Row style={{ ...tableRow, backgroundColor: rowBg }}>
      <Column style={{ width: '22%', verticalAlign: 'middle' as const, paddingLeft: '8px' }}>
        <Link
          href={`https://www.tradingview.com/chart/?symbol=${stock.symbol}`}
          style={symbolLink}
        >
          {stock.symbol}
        </Link>
      </Column>
      <Column style={{ width: '18%', textAlign: 'right' as const, verticalAlign: 'middle' as const }}>
        <Text style={{ ...gapText, color }}>
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
      <Column style={{ width: '10%', textAlign: 'right' as const, verticalAlign: 'middle' as const, paddingRight: '8px' }}>
        <Text style={volText}>{formatMarketCap(stock.marketCap)}</Text>
      </Column>
    </Row>
  );
}

/* ------------------------------------------------------------------ */
/*  Gap table with header and rows                                     */
/* ------------------------------------------------------------------ */

function GapTable({ stocks, title, icon, color, barBg }: {
  stocks: GapStock[];
  title: string;
  icon: string;
  color: string;
  barBg: string;
}) {
  if (stocks.length === 0) return null;
  const top10 = stocks.slice(0, 10);
  const maxGap = Math.max(...top10.map(s => Math.abs(s.gapPercent)), 1);

  return (
    <Section style={card}>
      <Row style={{ padding: '0 0 8px' }}>
        <Column>
          <Text style={{ ...sectionTitle, color }}>
            <span style={{ marginRight: '6px', fontSize: '14px' }}>{icon}</span>
            {title}
          </Text>
        </Column>
      </Row>

      {/* Column headers */}
      <Row style={headerRow}>
        <Column style={{ width: '22%', paddingLeft: '8px' }}><Text style={colHeader}>Symbol</Text></Column>
        <Column style={{ width: '18%', textAlign: 'right' as const }}><Text style={colHeader}>Gap</Text></Column>
        <Column style={{ width: '20%', paddingLeft: '10px' }}><Text style={colHeader}></Text></Column>
        <Column style={{ width: '18%', textAlign: 'right' as const }}><Text style={colHeader}>Price</Text></Column>
        <Column style={{ width: '12%', textAlign: 'right' as const }}><Text style={colHeader}>Vol</Text></Column>
        <Column style={{ width: '10%', textAlign: 'right' as const, paddingRight: '8px' }}><Text style={colHeader}>Cap</Text></Column>
      </Row>

      {top10.map((stock) => (
        <GapRow key={stock.symbol} stock={stock} maxGap={maxGap} color={color} barBg={barBg} />
      ))}
    </Section>
  );
}

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */

export function GapScannerEmail({
  date,
  gainers,
  losers,
  scanned,
  marketSession,
}: GapScannerEmailProps) {
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
          <Column style={{ width: '120px', textAlign: 'right' as const, verticalAlign: 'middle' as const }}>
            <Text style={sessionBadge}>
              {marketSession || 'Pre-Market'}
            </Text>
          </Column>
        </Row>

        {/* Summary stats */}
        <Section style={{ padding: '12px 0 0' }}>
          <Row>
            <Column>
              <Text style={summaryStats}>
                <span style={{ color: '#3fb950', fontWeight: 700 }}>{gainers.length}</span>
                <span style={{ color: '#8b949e' }}> gapping up</span>
                {' · '}
                <span style={{ color: '#f85149', fontWeight: 700 }}>{losers.length}</span>
                <span style={{ color: '#8b949e' }}> gapping down</span>
                {scanned ? (
                  <>
                    {' · '}
                    <span style={{ color: '#8b949e' }}>{scanned.toLocaleString()} scanned</span>
                  </>
                ) : null}
              </Text>
              {/* Gap heat bar */}
              <div style={heatBarTrack}>
                <div style={{ ...heatBarFillGreen, width: `${gainerPct}%` }} />
              </div>
            </Column>
          </Row>
        </Section>
      </Section>

      {/* Gainers table */}
      <GapTable
        stocks={gainers}
        title="Top Gainers"
        icon="🟢"
        color="#3fb950"
        barBg="#3fb950"
      />

      {/* Losers table */}
      <GapTable
        stocks={losers}
        title="Top Losers"
        icon="🔴"
        color="#f85149"
        barBg="#f85149"
      />
    </EmailLayout>
  );
}

export default GapScannerEmail;

/* ------------------------------------------------------------------ */
/*  Styles                                                             */
/* ------------------------------------------------------------------ */

const card: React.CSSProperties = {
  backgroundColor: '#161b22',
  border: '1px solid #30363d',
  borderRadius: '12px',
  padding: '16px 20px',
  marginBottom: '10px',
};

const dateTextStyle: React.CSSProperties = {
  color: '#ffffff',
  fontSize: '20px',
  fontWeight: 800,
  letterSpacing: '-0.02em',
  margin: 0,
};

const dateSubtext: React.CSSProperties = {
  color: '#8b949e',
  fontSize: '13px',
  fontWeight: 500,
  margin: '2px 0 0',
};

const sessionBadge: React.CSSProperties = {
  display: 'inline-block',
  fontSize: '12px',
  fontWeight: 700,
  padding: '5px 14px',
  borderRadius: '8px',
  margin: 0,
  letterSpacing: '0.02em',
  color: '#d29922',
  backgroundColor: '#2d2208',
  border: '1px solid #d2992230',
};

const summaryStats: React.CSSProperties = {
  fontSize: '12px',
  margin: '0 0 6px',
  lineHeight: '18px',
};

const heatBarTrack: React.CSSProperties = {
  height: '4px',
  backgroundColor: '#f8514930',
  borderRadius: '2px',
  overflow: 'hidden',
};

const heatBarFillGreen: React.CSSProperties = {
  height: '4px',
  backgroundColor: '#3fb950',
  borderRadius: '2px',
};

const sectionTitle: React.CSSProperties = {
  fontSize: '12px',
  fontWeight: 700,
  textTransform: 'uppercase' as const,
  letterSpacing: '0.06em',
  margin: 0,
};

const headerRow: React.CSSProperties = {
  borderBottom: '1px solid #30363d',
  padding: '0 0 6px',
};

const colHeader: React.CSSProperties = {
  color: '#484f58',
  fontSize: '10px',
  fontWeight: 600,
  textTransform: 'uppercase' as const,
  letterSpacing: '0.06em',
  margin: 0,
};

const tableRow: React.CSSProperties = {
  borderBottom: '1px solid #21262d',
  padding: '7px 0',
};

const symbolLink: React.CSSProperties = {
  color: '#58a6ff',
  fontSize: '13px',
  fontWeight: 700,
  textDecoration: 'none',
};

const gapText: React.CSSProperties = {
  fontSize: '13px',
  fontWeight: 700,
  margin: 0,
};

const barTrack: React.CSSProperties = {
  height: '4px',
  backgroundColor: '#21262d',
  borderRadius: '2px',
  overflow: 'hidden',
};

const barFill: React.CSSProperties = {
  height: '4px',
  borderRadius: '2px',
};

const priceText: React.CSSProperties = {
  color: '#e6edf3',
  fontSize: '13px',
  fontWeight: 500,
  margin: 0,
};

const volText: React.CSSProperties = {
  color: '#8b949e',
  fontSize: '11px',
  margin: 0,
};
