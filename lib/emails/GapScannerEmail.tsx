import {
  Section,
  Text,
  Link,
  Hr,
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
  date: string;
  gainers: GapStock[];
  losers: GapStock[];
  scanned: number;
  marketSession: string;
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

function GapTable({ stocks, title, color }: { stocks: GapStock[]; title: string; color: string }) {
  if (stocks.length === 0) return null;
  const top10 = stocks.slice(0, 10);
  return (
    <Section style={card}>
      <Text style={{ ...sectionTitle, color }}>{title}</Text>
      {/* Header */}
      <Row style={headerRow}>
        <Column style={{ width: '25%' }}><Text style={colHeader}>Symbol</Text></Column>
        <Column style={{ width: '20%', textAlign: 'right' as const }}><Text style={colHeader}>Gap %</Text></Column>
        <Column style={{ width: '20%', textAlign: 'right' as const }}><Text style={colHeader}>Price</Text></Column>
        <Column style={{ width: '20%', textAlign: 'right' as const }}><Text style={colHeader}>Volume</Text></Column>
        <Column style={{ width: '15%', textAlign: 'right' as const }}><Text style={colHeader}>Mkt Cap</Text></Column>
      </Row>
      {top10.map((stock) => (
        <Row key={stock.symbol} style={tableRow}>
          <Column style={{ width: '25%' }}>
            <Link
              href={`https://www.tradingview.com/chart/?symbol=${stock.symbol}`}
              style={symbolLink}
            >
              {stock.symbol}
            </Link>
          </Column>
          <Column style={{ width: '20%', textAlign: 'right' as const }}>
            <Text style={{ ...gapText, color }}>
              {stock.gapPercent >= 0 ? '+' : ''}{stock.gapPercent.toFixed(1)}%
            </Text>
          </Column>
          <Column style={{ width: '20%', textAlign: 'right' as const }}>
            <Text style={priceText}>${stock.price.toFixed(2)}</Text>
          </Column>
          <Column style={{ width: '20%', textAlign: 'right' as const }}>
            <Text style={volText}>{formatVolume(stock.volume)}</Text>
          </Column>
          <Column style={{ width: '15%', textAlign: 'right' as const }}>
            <Text style={volText}>{formatMarketCap(stock.marketCap)}</Text>
          </Column>
        </Row>
      ))}
    </Section>
  );
}

export function GapScannerEmail({
  date,
  gainers,
  losers,
  scanned,
  marketSession,
}: GapScannerEmailProps) {
  return (
    <EmailLayout previewText={`Gap Scan ${date} — ${gainers.length} gainers, ${losers.length} losers`}>
      {/* Header */}
      <Section style={card}>
        <Text style={dateText}>Pre-Market Gap Scan — {date}</Text>
        <Text style={summaryText}>
          {gainers.length} gapper{gainers.length !== 1 ? 's' : ''} up, {losers.length} gapper{losers.length !== 1 ? 's' : ''} down from {scanned.toLocaleString()} stocks scanned
        </Text>
        <Text style={sessionText}>Session: {marketSession}</Text>
      </Section>

      <GapTable stocks={gainers} title="Top Gainers" color="#3fb950" />
      <GapTable stocks={losers} title="Top Losers" color="#f85149" />

      <Hr style={{ borderColor: '#30363d', margin: '16px 0' }} />
    </EmailLayout>
  );
}

export default GapScannerEmail;

// -- Styles --

const card: React.CSSProperties = {
  backgroundColor: '#161b22',
  border: '1px solid #30363d',
  borderRadius: '12px',
  padding: '16px 20px',
  marginBottom: '12px',
};

const dateText: React.CSSProperties = {
  color: '#e6edf3',
  fontSize: '18px',
  fontWeight: 700,
  margin: '0 0 8px',
};

const summaryText: React.CSSProperties = {
  color: '#c9d1d9',
  fontSize: '14px',
  margin: '0 0 4px',
};

const sessionText: React.CSSProperties = {
  color: '#8b949e',
  fontSize: '12px',
  margin: 0,
};

const sectionTitle: React.CSSProperties = {
  fontSize: '13px',
  fontWeight: 600,
  textTransform: 'uppercase' as const,
  letterSpacing: '0.05em',
  margin: '0 0 12px',
};

const headerRow: React.CSSProperties = {
  borderBottom: '1px solid #30363d',
  padding: '0 0 6px',
  marginBottom: '4px',
};

const colHeader: React.CSSProperties = {
  color: '#8b949e',
  fontSize: '11px',
  fontWeight: 600,
  textTransform: 'uppercase' as const,
  margin: 0,
};

const tableRow: React.CSSProperties = {
  borderBottom: '1px solid #21262d',
  padding: '6px 0',
};

const symbolLink: React.CSSProperties = {
  color: '#58a6ff',
  fontSize: '13px',
  fontWeight: 600,
  textDecoration: 'none',
};

const gapText: React.CSSProperties = {
  fontSize: '13px',
  fontWeight: 700,
  margin: 0,
};

const priceText: React.CSSProperties = {
  color: '#e6edf3',
  fontSize: '13px',
  margin: 0,
};

const volText: React.CSSProperties = {
  color: '#8b949e',
  fontSize: '12px',
  margin: 0,
};
