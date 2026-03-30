import {
  Section,
  Text,
  Link,
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

const SENTIMENT_CONFIG: Record<string, { color: string; bg: string; icon: string; label: string }> = {
  bullish: { color: '#3fb950', bg: '#132d1b', icon: '▲', label: 'Bullish' },
  bearish: { color: '#f85149', bg: '#3b1c1c', icon: '▼', label: 'Bearish' },
  neutral: { color: '#8b949e', bg: '#1c2128', icon: '●', label: 'Neutral' },
  mixed: { color: '#d29922', bg: '#2d2208', icon: '◆', label: 'Mixed' },
};

const SECTION_ICONS: Record<string, string> = {
  snapshot: '📊',
  movers: '⚡',
  news: '📰',
  events: '📅',
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
/*  Ticker row with direction arrow and subtle row tint               */
/* ------------------------------------------------------------------ */

function TickerRow({ item }: { item: MarketItem }) {
  const isUp = item.change >= 0;
  const sign = isUp ? '+' : '';
  const arrow = isUp ? '▲' : '▼';
  const arrowColor = isUp ? '#3fb950' : '#f85149';
  const pillBg = isUp ? '#132d1b' : '#3b1c1c';
  const pillColor = isUp ? '#3fb950' : '#f85149';
  const rowBg = isUp ? 'rgba(63,185,80,0.04)' : 'rgba(248,81,73,0.04)';

  return (
    <Row style={{ ...tickerRow, backgroundColor: rowBg }}>
      <Column style={{ width: '5%', verticalAlign: 'middle' as const, paddingLeft: '8px' }}>
        <Text style={{ color: arrowColor, fontSize: '8px', margin: 0, lineHeight: '14px' }}>{arrow}</Text>
      </Column>
      <Column style={{ width: '40%', verticalAlign: 'middle' as const }}>
        <Link href={getTickerUrl(item.symbol)} style={tickerName}>
          {item.name}
        </Link>
        <Text style={tickerSymbol}>{item.symbol}</Text>
      </Column>
      <Column style={{ width: '28%', textAlign: 'right' as const, verticalAlign: 'middle' as const, paddingRight: '10px' }}>
        <Text style={tickerPrice}>{formatPrice(item.price, item.symbol)}</Text>
      </Column>
      <Column style={{ width: '27%', textAlign: 'right' as const, verticalAlign: 'middle' as const, paddingRight: '8px' }}>
        <Text style={{ ...changePill, backgroundColor: pillBg, color: pillColor }}>
          {sign}{item.changePercent.toFixed(2)}%
        </Text>
      </Column>
    </Row>
  );
}

function TickerGroup({ items, label, icon }: { items: MarketItem[]; label: string; icon: string }) {
  if (items.length === 0) return null;
  return (
    <>
      <Text style={groupLabel}>
        <span style={{ marginRight: '6px' }}>{icon}</span>
        {label}
      </Text>
      {items.map((item) => <TickerRow key={item.symbol} item={item} />)}
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Section header with icon                                           */
/* ------------------------------------------------------------------ */

function SectionHeader({ icon, title }: { icon: string; title: string }) {
  return (
    <Row style={{ padding: '0 0 8px' }}>
      <Column>
        <Text style={sectionTitle}>
          <span style={{ marginRight: '6px', fontSize: '14px' }}>{icon}</span>
          {title}
        </Text>
      </Column>
    </Row>
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
  const sentiment = SENTIMENT_CONFIG[aiSummary.sentiment] || SENTIMENT_CONFIG.neutral;

  // Count gainers/losers for the heat bar
  const allItems = [...indices, ...stocks, ...crypto];
  const gainers = allItems.filter(i => i.change > 0).length;
  const losers = allItems.filter(i => i.change < 0).length;
  const total = allItems.length || 1;
  const gainerPct = Math.round((gainers / total) * 100);

  return (
    <EmailLayout previewText={`Market Briefing ${date} — ${aiSummary.sentiment}`}>
      {/* Header card with sentiment */}
      <Section style={card}>
        <Row>
          <Column style={{ verticalAlign: 'middle' as const }}>
            <Text style={dateText}>Market Briefing</Text>
            <Text style={dateSubtext}>{date}</Text>
          </Column>
          <Column style={{ width: '120px', textAlign: 'right' as const, verticalAlign: 'middle' as const }}>
            <Text style={{
              ...sentimentBadge,
              color: sentiment.color,
              backgroundColor: sentiment.bg,
              border: `1px solid ${sentiment.color}30`,
            }}>
              {sentiment.icon} {sentiment.label}
            </Text>
          </Column>
        </Row>

        {/* Market heat bar */}
        <Section style={{ padding: '12px 0 0' }}>
          <Row>
            <Column>
              <Text style={heatBarLabel}>
                <span style={{ color: '#3fb950' }}>{gainers} up</span>
                {' · '}
                <span style={{ color: '#f85149' }}>{losers} down</span>
              </Text>
              <div style={heatBarTrack}>
                <div style={{ ...heatBarFill, width: `${gainerPct}%` }} />
              </div>
            </Column>
          </Row>
        </Section>
      </Section>

      {/* Market Overview */}
      <Section style={card}>
        <Text style={overviewText}>{aiSummary.marketOverview}</Text>
      </Section>

      {/* Market Snapshot */}
      <Section style={card}>
        <SectionHeader icon={SECTION_ICONS.snapshot} title="Market Snapshot" />
        <TickerGroup items={indices} label="Indices" icon="📈" />
        <TickerGroup items={stocks} label="Stocks" icon="🏢" />
        <TickerGroup items={crypto} label="Crypto" icon="₿" />
      </Section>

      {/* Big Movers */}
      {aiSummary.bigMovers.length > 0 && (
        <Section style={card}>
          <SectionHeader icon={SECTION_ICONS.movers} title="Big Movers" />
          {aiSummary.bigMovers.map((mover, i) => {
            const isDown = mover.move.startsWith('-');
            return (
              <Section key={i} style={moverRow}>
                <Row>
                  <Column style={{ width: '65%', verticalAlign: 'top' as const }}>
                    <Row>
                      <Column style={{ width: 'auto' }}>
                        <Link href={getTickerUrl(mover.symbol)} style={moverLink}>{mover.symbol}</Link>
                      </Column>
                      <Column style={{ width: 'auto', paddingLeft: '8px' }}>
                        <Text style={{
                          ...moverMoveBadge,
                          backgroundColor: isDown ? '#3b1c1c' : '#132d1b',
                          color: isDown ? '#f85149' : '#3fb950',
                        }}>
                          {mover.move}
                        </Text>
                      </Column>
                    </Row>
                    <Text style={moverReason}>{mover.reason}</Text>
                  </Column>
                </Row>
              </Section>
            );
          })}
        </Section>
      )}

      {/* News */}
      {aiSummary.newsHighlights.length > 0 && (
        <Section style={card}>
          <SectionHeader icon={SECTION_ICONS.news} title="News" />
          {aiSummary.newsHighlights.map((item, i) => {
            const news = typeof item === 'string' ? { headline: item, url: '' } : item;
            return (
              <Row key={i} style={newsRow}>
                <Column style={{ width: '16px', verticalAlign: 'top' as const, paddingTop: '2px' }}>
                  <Text style={newsBullet}>→</Text>
                </Column>
                <Column style={{ verticalAlign: 'top' as const }}>
                  <Text style={newsItem}>
                    {news.url ? (
                      <Link href={news.url} style={newsLink}>{news.headline}</Link>
                    ) : (
                      news.headline
                    )}
                  </Text>
                </Column>
              </Row>
            );
          })}
        </Section>
      )}

      {/* Upcoming Events */}
      {aiSummary.upcomingEvents.length > 0 && (
        <Section style={card}>
          <SectionHeader icon={SECTION_ICONS.events} title="Upcoming Events" />
          {aiSummary.upcomingEvents.map((event, i) => (
            <Row key={i} style={eventRow}>
              <Column style={{ width: '4px', verticalAlign: 'top' as const, paddingTop: '6px' }}>
                <div style={eventDot} />
              </Column>
              <Column style={{ paddingLeft: '10px', verticalAlign: 'top' as const }}>
                <Text style={eventItem}>{event}</Text>
              </Column>
            </Row>
          ))}
        </Section>
      )}
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
  marginBottom: '10px',
};

const dateText: React.CSSProperties = {
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

const sentimentBadge: React.CSSProperties = {
  display: 'inline-block',
  fontSize: '12px',
  fontWeight: 700,
  padding: '5px 14px',
  borderRadius: '8px',
  margin: 0,
  letterSpacing: '0.02em',
};

const heatBarLabel: React.CSSProperties = {
  color: '#8b949e',
  fontSize: '11px',
  margin: '0 0 4px',
};

const heatBarTrack: React.CSSProperties = {
  height: '4px',
  backgroundColor: '#f8514930',
  borderRadius: '2px',
  overflow: 'hidden',
};

const heatBarFill: React.CSSProperties = {
  height: '4px',
  backgroundColor: '#3fb950',
  borderRadius: '2px',
};

const overviewText: React.CSSProperties = {
  color: '#c9d1d9',
  fontSize: '14px',
  lineHeight: '22px',
  margin: 0,
};

const sectionTitle: React.CSSProperties = {
  color: '#F97316',
  fontSize: '12px',
  fontWeight: 700,
  textTransform: 'uppercase' as const,
  letterSpacing: '0.06em',
  margin: 0,
};

// --- Market Snapshot ---

const groupLabel: React.CSSProperties = {
  color: '#58a6ff',
  fontSize: '10px',
  fontWeight: 700,
  textTransform: 'uppercase' as const,
  letterSpacing: '0.08em',
  margin: '14px 0 4px',
  paddingBottom: '4px',
  borderBottom: '1px solid #21262d',
};

const tickerRow: React.CSSProperties = {
  borderBottom: '1px solid #21262d',
  padding: '7px 0',
};

const tickerName: React.CSSProperties = {
  color: '#e6edf3',
  fontSize: '13px',
  fontWeight: 600,
  textDecoration: 'none',
  lineHeight: '16px',
};

const tickerSymbol: React.CSSProperties = {
  color: '#484f58',
  fontSize: '10px',
  fontWeight: 500,
  margin: '1px 0 0',
  lineHeight: '12px',
};

const tickerPrice: React.CSSProperties = {
  color: '#c9d1d9',
  fontSize: '13px',
  fontWeight: 500,
  margin: 0,
};

const changePill: React.CSSProperties = {
  display: 'inline-block',
  fontSize: '11px',
  fontWeight: 700,
  padding: '3px 10px',
  borderRadius: '6px',
  margin: 0,
  textAlign: 'center' as const,
};

// --- Big Movers ---

const moverRow: React.CSSProperties = {
  padding: '10px 0',
  borderBottom: '1px solid #21262d',
};

const moverLink: React.CSSProperties = {
  color: '#58a6ff',
  fontSize: '15px',
  fontWeight: 700,
  textDecoration: 'none',
};

const moverMoveBadge: React.CSSProperties = {
  display: 'inline-block',
  fontSize: '11px',
  fontWeight: 700,
  padding: '2px 8px',
  borderRadius: '4px',
  margin: 0,
};

const moverReason: React.CSSProperties = {
  color: '#8b949e',
  fontSize: '12px',
  margin: '4px 0 0',
  lineHeight: '18px',
};

// --- News ---

const newsRow: React.CSSProperties = {
  padding: '4px 0',
};

const newsBullet: React.CSSProperties = {
  color: '#F97316',
  fontSize: '12px',
  fontWeight: 700,
  margin: 0,
  lineHeight: '20px',
};

const newsItem: React.CSSProperties = {
  color: '#c9d1d9',
  fontSize: '13px',
  lineHeight: '20px',
  margin: '0 0 4px',
};

const newsLink: React.CSSProperties = {
  color: '#58a6ff',
  textDecoration: 'none',
};

// --- Events ---

const eventRow: React.CSSProperties = {
  padding: '4px 0',
};

const eventDot: React.CSSProperties = {
  width: '4px',
  height: '4px',
  borderRadius: '2px',
  backgroundColor: '#F97316',
};

const eventItem: React.CSSProperties = {
  color: '#c9d1d9',
  fontSize: '13px',
  lineHeight: '20px',
  margin: 0,
};
