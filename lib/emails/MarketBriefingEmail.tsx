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

/* ------------------------------------------------------------------ */
/*  Market snapshot — one row per ticker, like the reference email     */
/* ------------------------------------------------------------------ */

function TickerRow({ item }: { item: MarketItem }) {
  const isUp = item.change >= 0;
  const sign = isUp ? '+' : '';
  const pillBg = isUp ? '#163b28' : '#3b1c1c';
  const pillColor = isUp ? '#3fb950' : '#f85149';

  return (
    <Row style={tickerRow}>
      <Column style={{ width: '45%', verticalAlign: 'middle' as const }}>
        <Link href={getTickerUrl(item.symbol)} style={tickerName}>
          {item.name}
        </Link>
      </Column>
      <Column style={{ width: '30%', textAlign: 'right' as const, verticalAlign: 'middle' as const, paddingRight: '12px' }}>
        <Text style={tickerPrice}>{formatPrice(item.price, item.symbol)}</Text>
      </Column>
      <Column style={{ width: '25%', textAlign: 'right' as const, verticalAlign: 'middle' as const }}>
        <Text style={{ ...changePill, backgroundColor: pillBg, color: pillColor }}>
          {sign}{item.changePercent.toFixed(2)}%
        </Text>
      </Column>
    </Row>
  );
}

function TickerGroup({ items, label }: { items: MarketItem[]; label: string }) {
  if (items.length === 0) return null;
  return (
    <>
      <Text style={groupLabel}>{label}</Text>
      {items.map((item) => <TickerRow key={item.symbol} item={item} />)}
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */

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
      {/* Header */}
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
        <Text style={overviewLabel}>Market:</Text>
        <Text style={bodyText}>{aiSummary.marketOverview}</Text>
      </Section>

      {/* Market Snapshot */}
      <Section style={card}>
        <Text style={sectionTitle}>Market Snapshot</Text>
        <TickerGroup items={indices} label="Indices" />
        <TickerGroup items={stocks} label="Stocks" />
        <TickerGroup items={crypto} label="Crypto" />
      </Section>

      {/* Big Movers */}
      {aiSummary.bigMovers.length > 0 && (
        <Section style={card}>
          <Text style={sectionTitle}>Big Movers</Text>
          {aiSummary.bigMovers.map((mover, i) => (
            <Section key={i} style={moverRow}>
              <Row>
                <Column style={{ width: '70%', verticalAlign: 'top' as const }}>
                  <Link href={getTickerUrl(mover.symbol)} style={moverLink}>{mover.symbol}</Link>
                  <Text style={moverReason}>{mover.reason}</Text>
                </Column>
                <Column style={{ width: '30%', textAlign: 'right' as const, verticalAlign: 'top' as const }}>
                  <Text style={{
                    ...changePill,
                    backgroundColor: mover.move.startsWith('-') ? '#3b1c1c' : '#163b28',
                    color: mover.move.startsWith('-') ? '#f85149' : '#3fb950',
                    fontSize: '13px',
                  }}>
                    {mover.move}
                  </Text>
                </Column>
              </Row>
            </Section>
          ))}
        </Section>
      )}

      {/* News */}
      {aiSummary.newsHighlights.length > 0 && (
        <Section style={card}>
          <Text style={sectionTitle}>News</Text>
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

/* ------------------------------------------------------------------ */
/*  Styles                                                             */
/* ------------------------------------------------------------------ */

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
  fontWeight: 700,
  textTransform: 'uppercase' as const,
  letterSpacing: '0.05em',
  margin: '0 0 8px',
};

const overviewLabel: React.CSSProperties = {
  color: '#e6edf3',
  fontSize: '14px',
  fontWeight: 700,
  margin: '0 0 4px',
};

const bodyText: React.CSSProperties = {
  color: '#c9d1d9',
  fontSize: '14px',
  lineHeight: '22px',
  margin: 0,
};

// --- Market Snapshot ---

const groupLabel: React.CSSProperties = {
  color: '#58a6ff',
  fontSize: '11px',
  fontWeight: 700,
  textTransform: 'uppercase' as const,
  letterSpacing: '0.06em',
  margin: '12px 0 4px',
  paddingBottom: '4px',
  borderBottom: '1px solid #30363d',
};

const tickerRow: React.CSSProperties = {
  borderBottom: '1px solid #21262d',
  padding: '8px 0',
};

const tickerName: React.CSSProperties = {
  color: '#e6edf3',
  fontSize: '14px',
  fontWeight: 600,
  textDecoration: 'none',
};

const tickerPrice: React.CSSProperties = {
  color: '#c9d1d9',
  fontSize: '14px',
  margin: 0,
};

const changePill: React.CSSProperties = {
  display: 'inline-block',
  fontSize: '12px',
  fontWeight: 700,
  padding: '3px 10px',
  borderRadius: '6px',
  margin: 0,
  textAlign: 'center' as const,
};

// --- Big Movers ---

const moverRow: React.CSSProperties = {
  padding: '8px 0',
  borderBottom: '1px solid #21262d',
};

const moverLink: React.CSSProperties = {
  color: '#58a6ff',
  fontSize: '14px',
  fontWeight: 700,
  textDecoration: 'none',
};

const moverReason: React.CSSProperties = {
  color: '#8b949e',
  fontSize: '13px',
  margin: '2px 0 0',
  lineHeight: '18px',
};

// --- News & Events ---

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
