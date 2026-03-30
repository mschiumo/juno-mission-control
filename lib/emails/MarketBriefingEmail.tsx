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

interface MarketItem {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  status: 'up' | 'down' | 'flat';
}

interface BriefingEmailProps {
  date: string;
  indices: MarketItem[];
  stocks: MarketItem[];
  crypto: MarketItem[];
  aiSummary: {
    marketOverview: string;
    bigMovers: { symbol: string; move: string; reason: string }[];
    newsHighlights: { headline: string; url: string }[];
    upcomingEvents: string[];
    sentiment: 'bullish' | 'bearish' | 'neutral' | 'mixed';
  };
}

const SENTIMENT_COLORS: Record<string, { color: string; bg: string }> = {
  bullish: { color: '#3fb950', bg: '#3fb95020' },
  bearish: { color: '#f85149', bg: '#f8514920' },
  neutral: { color: '#8b949e', bg: '#8b949e20' },
  mixed: { color: '#d29922', bg: '#d2992220' },
};

function getTickerUrl(symbol: string): string {
  if (symbol === 'BTC' || symbol === 'ETH') {
    return `https://www.tradingview.com/chart/?symbol=BINANCE:${symbol}USDT`;
  }
  if (symbol === 'VIX') {
    return `https://www.tradingview.com/chart/?symbol=TVC:VIX`;
  }
  return `https://www.tradingview.com/chart/?symbol=${symbol}`;
}

function formatPrice(price: number, symbol: string): string {
  if (symbol === 'BTC' || symbol === 'ETH') {
    return `$${price.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  }
  return `$${price.toFixed(2)}`;
}

function PriceRow({ item }: { item: MarketItem }) {
  const isUp = item.change >= 0;
  const color = isUp ? '#3fb950' : '#f85149';
  const sign = isUp ? '+' : '';
  return (
    <Row style={tableRow}>
      <Column style={{ width: '35%', paddingRight: '4px' }}>
        <Link href={getTickerUrl(item.symbol)} style={symbolLink}>
          {item.symbol}
        </Link>
      </Column>
      <Column style={{ width: '35%', textAlign: 'right' as const, paddingRight: '8px' }}>
        <Text style={priceText}>{formatPrice(item.price, item.symbol)}</Text>
      </Column>
      <Column style={{ width: '30%', textAlign: 'right' as const }}>
        <Text style={{ ...changeText, color }}>
          {sign}{item.changePercent.toFixed(2)}%
        </Text>
      </Column>
    </Row>
  );
}

export function MarketBriefingEmail({
  date,
  indices,
  stocks,
  crypto,
  aiSummary,
}: BriefingEmailProps) {
  const sentimentStyle = SENTIMENT_COLORS[aiSummary.sentiment] || SENTIMENT_COLORS.neutral;

  return (
    <EmailLayout previewText={`Market Briefing ${date} — ${aiSummary.sentiment}`}>
      {/* Date + Sentiment */}
      <Section style={card}>
        <Text style={dateText}>Market Briefing — {date}</Text>
        <Text
          style={{
            ...sentimentBadge,
            color: sentimentStyle.color,
            backgroundColor: sentimentStyle.bg,
          }}
        >
          {aiSummary.sentiment.charAt(0).toUpperCase() + aiSummary.sentiment.slice(1)}
        </Text>
      </Section>

      {/* Market Overview */}
      <Section style={card}>
        <Text style={sectionTitle}>Market Overview</Text>
        <Text style={bodyText}>{aiSummary.marketOverview}</Text>
      </Section>

      {/* All prices in a single card */}
      <Section style={card}>
        {/* Column headers */}
        <Row style={{ paddingBottom: '6px', borderBottom: '1px solid #30363d', marginBottom: '4px' }}>
          <Column style={{ width: '35%' }}><Text style={colHeader}>Symbol</Text></Column>
          <Column style={{ width: '35%', textAlign: 'right' as const, paddingRight: '8px' }}><Text style={colHeader}>Price</Text></Column>
          <Column style={{ width: '30%', textAlign: 'right' as const }}><Text style={colHeader}>Change</Text></Column>
        </Row>

        {/* Indices */}
        {indices.length > 0 && (
          <>
            <Text style={groupLabel}>Indices</Text>
            {indices.map((item) => <PriceRow key={item.symbol} item={item} />)}
          </>
        )}

        {/* Stocks */}
        {stocks.length > 0 && (
          <>
            <Text style={groupLabel}>Stocks</Text>
            {stocks.map((item) => <PriceRow key={item.symbol} item={item} />)}
          </>
        )}

        {/* Crypto */}
        {crypto.length > 0 && (
          <>
            <Text style={groupLabel}>Crypto</Text>
            {crypto.map((item) => <PriceRow key={item.symbol} item={item} />)}
          </>
        )}
      </Section>

      {/* Big Movers */}
      {aiSummary.bigMovers.length > 0 && (
        <Section style={card}>
          <Text style={sectionTitle}>Big Movers</Text>
          {aiSummary.bigMovers.map((mover, i) => (
            <Section key={i} style={moverRow}>
              <Text style={moverSymbol}>
                <Link href={getTickerUrl(mover.symbol)} style={symbolLink}>
                  {mover.symbol}
                </Link>
                {' '}
                <span style={{ color: mover.move.startsWith('-') ? '#f85149' : '#3fb950' }}>
                  {mover.move}
                </span>
              </Text>
              <Text style={moverReason}>{mover.reason}</Text>
            </Section>
          ))}
        </Section>
      )}

      {/* News Highlights */}
      {aiSummary.newsHighlights.length > 0 && (
        <Section style={card}>
          <Text style={sectionTitle}>News Highlights</Text>
          {aiSummary.newsHighlights.map((item, i) => {
            const news = typeof item === 'string' ? { headline: item, url: '' } : item;
            return (
              <Text key={i} style={newsItem}>
                {news.url ? (
                  <Link href={news.url} style={newsLink}>{news.headline}</Link>
                ) : (
                  news.headline
                )}
              </Text>
            );
          })}
        </Section>
      )}

      {/* Upcoming Events */}
      {aiSummary.upcomingEvents.length > 0 && (
        <Section style={card}>
          <Text style={sectionTitle}>Upcoming Events</Text>
          {aiSummary.upcomingEvents.map((event, i) => (
            <Text key={i} style={eventItem}>{event}</Text>
          ))}
        </Section>
      )}

      <Hr style={{ borderColor: '#30363d', margin: '16px 0' }} />
    </EmailLayout>
  );
}

export default MarketBriefingEmail;

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

const sentimentBadge: React.CSSProperties = {
  display: 'inline-block',
  fontSize: '12px',
  fontWeight: 600,
  padding: '4px 12px',
  borderRadius: '9999px',
  margin: 0,
};

const sectionTitle: React.CSSProperties = {
  color: '#F97316',
  fontSize: '13px',
  fontWeight: 600,
  textTransform: 'uppercase' as const,
  letterSpacing: '0.05em',
  margin: '0 0 12px',
};

const bodyText: React.CSSProperties = {
  color: '#c9d1d9',
  fontSize: '14px',
  lineHeight: '22px',
  margin: 0,
};

const colHeader: React.CSSProperties = {
  color: '#8b949e',
  fontSize: '11px',
  fontWeight: 600,
  textTransform: 'uppercase' as const,
  margin: 0,
};

const groupLabel: React.CSSProperties = {
  color: '#8b949e',
  fontSize: '10px',
  fontWeight: 600,
  textTransform: 'uppercase' as const,
  letterSpacing: '0.08em',
  margin: '10px 0 4px',
};

const tableRow: React.CSSProperties = {
  borderBottom: '1px solid #21262d',
  padding: '5px 0',
};

const symbolLink: React.CSSProperties = {
  color: '#58a6ff',
  fontSize: '13px',
  fontWeight: 600,
  textDecoration: 'none',
};

const priceText: React.CSSProperties = {
  color: '#e6edf3',
  fontSize: '13px',
  fontWeight: 500,
  margin: 0,
};

const changeText: React.CSSProperties = {
  fontSize: '13px',
  fontWeight: 600,
  margin: 0,
};

const moverRow: React.CSSProperties = {
  padding: '8px 0',
  borderBottom: '1px solid #21262d',
};

const moverSymbol: React.CSSProperties = {
  color: '#e6edf3',
  fontSize: '14px',
  fontWeight: 600,
  margin: '0 0 2px',
};

const moverReason: React.CSSProperties = {
  color: '#8b949e',
  fontSize: '13px',
  margin: 0,
};

const newsItem: React.CSSProperties = {
  color: '#c9d1d9',
  fontSize: '13px',
  lineHeight: '20px',
  margin: '0 0 8px',
  paddingLeft: '12px',
  borderLeft: '2px solid #30363d',
};

const newsLink: React.CSSProperties = {
  color: '#58a6ff',
  textDecoration: 'none',
};

const eventItem: React.CSSProperties = {
  color: '#c9d1d9',
  fontSize: '13px',
  lineHeight: '20px',
  margin: '0 0 6px',
  paddingLeft: '12px',
  borderLeft: '2px solid #F97316',
};
