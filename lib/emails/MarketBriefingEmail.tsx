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

interface GapStock {
  symbol: string;
  gapPercent: number;
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
  gapData?: {
    gainers: GapStock[];
    losers: GapStock[];
  };
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
  accentLight:   '#FF8C38',
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

const SENTIMENT_CONFIG: Record<string, { color: string; bg: string; border: string; icon: string; label: string }> = {
  bullish: { color: P.positive,      bg: P.positiveDim,  border: `${P.positive}40`,      icon: '▲', label: 'Bullish' },
  bearish: { color: P.negative,      bg: P.negativeDim,  border: `${P.negative}40`,      icon: '▼', label: 'Bearish' },
  neutral: { color: P.textSecondary, bg: 'rgba(126,140,160,0.1)', border: 'rgba(126,140,160,0.3)', icon: '●', label: 'Neutral' },
  mixed:   { color: P.warning,       bg: P.warningDim,   border: `${P.warning}40`,       icon: '◆', label: 'Mixed' },
};

const SECTION_ICONS = { snapshot: '📊', gaps: '🔍', movers: '⚡', news: '📰', events: '📅' };

function getTickerUrl(symbol: string): string {
  if (symbol === 'BTC' || symbol === 'ETH') return `https://www.tradingview.com/chart/?symbol=BINANCE:${symbol}USDT`;
  if (symbol === 'VIX') return `https://www.tradingview.com/chart/?symbol=TVC:VIX`;
  return `https://www.tradingview.com/chart/?symbol=${symbol}`;
}

function formatPrice(price: number, symbol: string): string {
  if (symbol === 'BTC' || symbol === 'ETH') {
    return `$${price.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  }
  return `$${price.toFixed(2)}`;
}

/* ------------------------------------------------------------------ */
/*  Ticker row                                                         */
/* ------------------------------------------------------------------ */

function TickerRow({ item }: { item: MarketItem }) {
  const isUp = item.change >= 0;
  const sign = isUp ? '+' : '';
  return (
    <Row style={{ ...tickerRow, backgroundColor: isUp ? 'rgba(0,200,150,0.03)' : 'rgba(255,61,87,0.03)' }}>
      <Column style={{ width: '5%', verticalAlign: 'middle' as const, paddingLeft: '10px' }}>
        <Text style={{ color: isUp ? P.positive : P.negative, fontSize: '8px', margin: 0, lineHeight: '16px' }}>
          {isUp ? '▲' : '▼'}
        </Text>
      </Column>
      <Column style={{ width: '42%', verticalAlign: 'middle' as const }}>
        <Link href={getTickerUrl(item.symbol)} style={tickerName}>{item.name}</Link>
        <Text style={tickerSymbol}>{item.symbol}</Text>
      </Column>
      <Column style={{ width: '27%', textAlign: 'right' as const, verticalAlign: 'middle' as const, paddingRight: '12px' }}>
        <Text style={tickerPrice}>{formatPrice(item.price, item.symbol)}</Text>
      </Column>
      <Column style={{ width: '26%', textAlign: 'right' as const, verticalAlign: 'middle' as const, paddingRight: '10px' }}>
        <Text style={{
          ...changePill,
          backgroundColor: isUp ? P.positiveDim : P.negativeDim,
          color: isUp ? P.positive : P.negative,
        }}>
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
      <Text style={groupLabel}><span style={{ marginRight: '6px' }}>{icon}</span>{label}</Text>
      {items.map((item) => <TickerRow key={item.symbol} item={item} />)}
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Gap copy box                                                       */
/* ------------------------------------------------------------------ */

function TickerCopyBox({ stocks, label, color, dimBg, icon }: {
  stocks: GapStock[]; label: string; color: string; dimBg: string; icon: string;
}) {
  if (stocks.length === 0) return null;
  const top10 = stocks.slice(0, 10);
  return (
    <Section style={{ padding: '8px 0' }}>
      <Text style={{ ...gapListLabel, color }}>
        <span style={{ marginRight: '6px' }}>{icon}</span>{label}
      </Text>
      <div style={{ ...tickerBox, borderColor: `${color}20` }}>
        <Text style={tickerBoxText}>{top10.map(s => s.symbol).join(', ')}</Text>
      </div>
      <Text style={tickerBoxHint}>Select and copy tickers to your watchlist</Text>
      <Text style={gapDetails}>
        {top10.map(s => `${s.symbol} (${s.gapPercent >= 0 ? '+' : ''}${s.gapPercent.toFixed(1)}%)`).join('  ·  ')}
      </Text>
    </Section>
  );
}

/* ------------------------------------------------------------------ */
/*  Section header                                                     */
/* ------------------------------------------------------------------ */

function SectionHeader({ icon, title }: { icon: string; title: string }) {
  return (
    <Row style={sectionHeaderRow}>
      <Column>
        <Text style={sectionTitle}>
          <span style={{ marginRight: '7px', fontSize: '14px' }}>{icon}</span>{title}
        </Text>
      </Column>
    </Row>
  );
}

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */

export function MarketBriefingEmail({ date, indices, stocks, crypto, aiSummary, gapData }: BriefingEmailProps) {
  const sentiment = SENTIMENT_CONFIG[aiSummary.sentiment] || SENTIMENT_CONFIG.neutral;
  const allItems = [...indices, ...stocks, ...crypto];
  const gainers = allItems.filter(i => i.change > 0).length;
  const losers = allItems.filter(i => i.change < 0).length;
  const total = allItems.length || 1;
  const gainerPct = Math.round((gainers / total) * 100);

  return (
    <EmailLayout previewText={`Market Briefing ${date} — ${aiSummary.sentiment}`}>

      {/* Header — title + sentiment */}
      <Section style={card}>
        <Row>
          <Column style={{ verticalAlign: 'middle' as const }}>
            <Text style={dateText}>Market Briefing</Text>
            <Text style={dateSubtext}>{date}</Text>
          </Column>
          <Column style={{ width: '130px', textAlign: 'right' as const, verticalAlign: 'middle' as const }}>
            <Text style={{ ...sentimentBadge, color: sentiment.color, backgroundColor: sentiment.bg, border: `1px solid ${sentiment.border}` }}>
              {sentiment.icon} {sentiment.label}
            </Text>
          </Column>
        </Row>
        <Section style={{ padding: '14px 0 0' }}>
          <Row>
            <Column>
              <Text style={heatBarLabel}>
                <span style={{ color: P.positive, fontWeight: 700 }}>{gainers}</span>
                <span style={{ color: P.textTertiary }}> up</span>
                {'  ·  '}
                <span style={{ color: P.negative, fontWeight: 700 }}>{losers}</span>
                <span style={{ color: P.textTertiary }}> down</span>
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

      {/* Pre-Market Gaps */}
      {gapData && (gapData.gainers.length > 0 || gapData.losers.length > 0) && (
        <Section style={card}>
          <SectionHeader icon={SECTION_ICONS.gaps} title="Pre-Market Gaps" />
          <TickerCopyBox stocks={gapData.gainers} label="Gapping Up" color={P.positive} dimBg={P.positiveDim} icon="🟢" />
          <TickerCopyBox stocks={gapData.losers} label="Gapping Down" color={P.negative} dimBg={P.negativeDim} icon="🔴" />
        </Section>
      )}

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
                      <Column style={{ width: 'auto', paddingLeft: '10px' }}>
                        <Text style={{
                          ...moverMoveBadge,
                          backgroundColor: isDown ? P.negativeDim : P.positiveDim,
                          color: isDown ? P.negative : P.positive,
                          border: `1px solid ${isDown ? P.negative : P.positive}30`,
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
                <Column style={{ width: '18px', verticalAlign: 'top' as const, paddingTop: '3px' }}>
                  <Text style={newsBullet}>→</Text>
                </Column>
                <Column style={{ verticalAlign: 'top' as const }}>
                  <Text style={newsItem}>
                    {news.url
                      ? <Link href={news.url} style={newsLink}>{news.headline}</Link>
                      : news.headline}
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
              <Column style={{ width: '4px', verticalAlign: 'top' as const, paddingTop: '7px' }}>
                <div style={eventDot} />
              </Column>
              <Column style={{ paddingLeft: '12px', verticalAlign: 'top' as const }}>
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
  background: `linear-gradient(135deg, rgba(255,255,255,0.025) 0%, transparent 60%), ${P.surface1}`,
  border: `1px solid ${P.borderDefault}`,
  borderRadius: '14px',
  padding: '20px 24px',
  marginBottom: '12px',
  boxShadow: '0 4px 24px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.02)',
};

const dateText: React.CSSProperties = {
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

const sentimentBadge: React.CSSProperties = {
  display: 'inline-block',
  fontSize: '12px',
  fontWeight: 700,
  padding: '6px 16px',
  borderRadius: '8px',
  margin: 0,
  letterSpacing: '0.03em',
};

const heatBarLabel: React.CSSProperties = {
  color: P.textSecondary,
  fontSize: '12px',
  margin: '0 0 6px',
};

const heatBarTrack: React.CSSProperties = {
  height: '4px',
  backgroundColor: P.negativeDim,
  borderRadius: '2px',
  overflow: 'hidden',
};

const heatBarFill: React.CSSProperties = {
  height: '4px',
  backgroundColor: P.positive,
  borderRadius: '2px',
};

const overviewText: React.CSSProperties = {
  color: P.textPrimary,
  fontSize: '14px',
  lineHeight: '23px',
  margin: 0,
};

const sectionHeaderRow: React.CSSProperties = {
  padding: '0 0 12px',
  borderBottom: `1px solid ${P.borderSubtle}`,
  marginBottom: '4px',
};

const sectionTitle: React.CSSProperties = {
  color: P.accent,
  fontSize: '11px',
  fontWeight: 700,
  textTransform: 'uppercase' as const,
  letterSpacing: '0.08em',
  margin: 0,
};

const groupLabel: React.CSSProperties = {
  color: P.info,
  fontSize: '10px',
  fontWeight: 700,
  textTransform: 'uppercase' as const,
  letterSpacing: '0.1em',
  margin: '16px 0 6px',
  paddingBottom: '5px',
  borderBottom: `1px solid ${P.borderSubtle}`,
};

const tickerRow: React.CSSProperties = {
  borderBottom: `1px solid ${P.borderSubtle}`,
  padding: '8px 0',
};

const tickerName: React.CSSProperties = {
  color: P.textPrimary,
  fontSize: '13px',
  fontWeight: 600,
  textDecoration: 'none',
  lineHeight: '17px',
};

const tickerSymbol: React.CSSProperties = {
  color: P.textTertiary,
  fontSize: '10px',
  fontWeight: 500,
  margin: '1px 0 0',
  lineHeight: '13px',
};

const tickerPrice: React.CSSProperties = {
  color: P.textSecondary,
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

const gapListLabel: React.CSSProperties = {
  fontSize: '11px',
  fontWeight: 700,
  textTransform: 'uppercase' as const,
  letterSpacing: '0.06em',
  margin: '0 0 8px',
};

const tickerBox: React.CSSProperties = {
  backgroundColor: P.bgBase,
  border: `1px solid ${P.borderDefault}`,
  borderRadius: '8px',
  padding: '12px 16px',
};

const tickerBoxText: React.CSSProperties = {
  color: P.textPrimary,
  fontSize: '14px',
  fontWeight: 600,
  fontFamily: 'monospace, Courier New, monospace',
  letterSpacing: '0.04em',
  lineHeight: '22px',
  margin: 0,
  wordBreak: 'break-word' as const,
};

const tickerBoxHint: React.CSSProperties = {
  color: P.textTertiary,
  fontSize: '10px',
  margin: '4px 0 0',
  fontStyle: 'italic' as const,
};

const gapDetails: React.CSSProperties = {
  color: P.textSecondary,
  fontSize: '11px',
  lineHeight: '18px',
  margin: '6px 0 0',
};

const moverRow: React.CSSProperties = {
  padding: '11px 0',
  borderBottom: `1px solid ${P.borderSubtle}`,
};

const moverLink: React.CSSProperties = {
  color: P.info,
  fontSize: '15px',
  fontWeight: 700,
  textDecoration: 'none',
};

const moverMoveBadge: React.CSSProperties = {
  display: 'inline-block',
  fontSize: '11px',
  fontWeight: 700,
  padding: '2px 9px',
  borderRadius: '5px',
  margin: 0,
};

const moverReason: React.CSSProperties = {
  color: P.textSecondary,
  fontSize: '12px',
  margin: '5px 0 0',
  lineHeight: '18px',
};

const newsRow: React.CSSProperties = { padding: '5px 0' };

const newsBullet: React.CSSProperties = {
  color: P.accent,
  fontSize: '12px',
  fontWeight: 700,
  margin: 0,
  lineHeight: '21px',
};

const newsItem: React.CSSProperties = {
  color: P.textPrimary,
  fontSize: '13px',
  lineHeight: '21px',
  margin: '0 0 4px',
};

const newsLink: React.CSSProperties = { color: P.info, textDecoration: 'none' };

const eventRow: React.CSSProperties = { padding: '5px 0' };

const eventDot: React.CSSProperties = {
  width: '4px',
  height: '4px',
  borderRadius: '2px',
  backgroundColor: P.accent,
};

const eventItem: React.CSSProperties = {
  color: P.textPrimary,
  fontSize: '13px',
  lineHeight: '21px',
  margin: 0,
};
