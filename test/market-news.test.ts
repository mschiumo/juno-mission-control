import { describe, it, expect } from 'vitest';
import {
  pickCategory,
  categorizeNews,
  parseFeed,
  parseFeedDate,
  buildPayload,
  headlineKey,
  isPayloadFresh,
  type RawNewsItem,
  type FeedSource,
} from '@/lib/news/market-news';
import { DIGEST_CATEGORIES, formatTimeAgo } from '@/lib/news/categories';

const NOW = Date.parse('2026-11-04T19:30:00Z');

function raw(overrides: Partial<RawNewsItem> & { headline: string }): RawNewsItem {
  return {
    datetime: Math.floor(NOW / 1000) - 600,
    summary: '',
    source: 'Test',
    url: `https://example.com/${encodeURIComponent(overrides.headline)}`,
    ...overrides,
  };
}

describe('pickCategory', () => {
  it('files war and geopolitics headlines that used to be dropped', () => {
    expect(pickCategory('Vance repudiates Iran war after US electoral defeat')).toBe('geopolitics');
    expect(pickCategory('US slaps sanctions on Indian, Turkish firms for aiding Iran')).toBe('geopolitics');
    expect(pickCategory("Ukraine's corruption police tie senior security officials to criminal ring")).toBe('geopolitics');
  });

  it('files politics, energy and general market stories', () => {
    expect(pickCategory('Democrats map out an agenda after midterm sweep')).toBe('politics');
    expect(pickCategory('Trump signs executive order on tariffs')).toBe('politics');
    expect(pickCategory("Polar Vortex Puts Europe's Gas Reserves at Risk")).toBe('commodities');
    expect(pickCategory('Stocks, Bonds Climb After US Election as Oil Sinks: Markets Wrap')).toBe('markets');
  });

  it('matches whole words only — "method" is not Ethereum, "solution" is not Solana', () => {
    expect(pickCategory('A new method for solar panel solutions in Canada')).toBeNull();
    expect(pickCategory('Ethereum climbs as ETH ETF inflows resume')).toBe('crypto');
  });

  it('matches ampersand tickers whole', () => {
    expect(pickCategory('S&P 500 futures edge higher before the open')).toBe('markets');
  });

  it('prefers the Fed over generic market words for FOMC headlines', () => {
    expect(pickCategory('Fed holds rates steady, Powell flags inflation risks')).toBe('fed');
  });

  it('returns null for stories with no market relevance', () => {
    expect(pickCategory('Bob Dylan blows in for meeting with Pope Leo at Vatican')).toBeNull();
  });

  it('requires a headline hit — a summary-only mention is not a market story', () => {
    expect(pickCategory('Senji Kuroi Has Died', 'He wrote about the economy and the salaried soul.')).toBeNull();
    // …but the summary still breaks ties between categories the headline matched.
    expect(pickCategory('Oil falls as Iran talks resume', 'Crude and Brent both slid on the day.')).toBe('commodities');
  });
});

describe('categorizeNews', () => {
  it('honours forceCategory and fallbackCategory', () => {
    expect(categorizeNews(raw({ headline: 'Anything', forceCategory: 'ai' }), NOW)?.category).toBe('ai');
    expect(categorizeNews(raw({ headline: 'Nothing relevant here', fallbackCategory: 'politics' }), NOW)?.category).toBe('politics');
    expect(categorizeNews(raw({ headline: 'Nothing relevant here' }), NOW)).toBeNull();
  });

  it('only attaches sentiment to crypto stories', () => {
    expect(categorizeNews(raw({ headline: 'Bitcoin surges to record high' }), NOW)?.sentiment).toBe('bullish');
    expect(categorizeNews(raw({ headline: 'Stocks surge to record high' }), NOW)?.sentiment).toBeUndefined();
  });
});

describe('parseFeed', () => {
  const feed: FeedSource = { name: 'Test Feed', url: 'https://example.com/rss' };

  it('parses RSS items including CDATA links and descriptions', () => {
    const xml = `<rss><channel>
      <item>
        <title><![CDATA[Federal Reserve issues FOMC statement]]></title>
        <link><![CDATA[https://www.federalreserve.gov/newsevents/pressreleases/monetary20261104a.htm]]></link>
        <description><![CDATA[<p>The Committee decided to <b>lower</b> the target range.</p>]]></description>
        <pubDate><![CDATA[Wed, 04 Nov 2026 19:00:00 GMT]]></pubDate>
      </item>
    </channel></rss>`;
    const items = parseFeed(xml, feed, NOW);
    expect(items).toHaveLength(1);
    expect(items[0].headline).toBe('Federal Reserve issues FOMC statement');
    expect(items[0].url).toBe('https://www.federalreserve.gov/newsevents/pressreleases/monetary20261104a.htm');
    expect(items[0].summary).toBe('The Committee decided to lower the target range.');
    expect(items[0].datetime).toBe(Math.floor(Date.parse('2026-11-04T19:00:00Z') / 1000));
  });

  it('parses Atom entries', () => {
    const xml = `<feed><entry>
      <title>OpenAI releases new model</title>
      <link rel="alternate" href="https://example.com/openai"/>
      <published>2026-11-04T18:00:00Z</published>
      <summary>Short summary.</summary>
    </entry></feed>`;
    const items = parseFeed(xml, { ...feed, force: 'ai' }, NOW);
    expect(items[0].url).toBe('https://example.com/openai');
    expect(items[0].forceCategory).toBe('ai');
  });

  it('strips the publisher suffix and uses <source> for Google News feeds', () => {
    const xml = `<rss><channel><item>
      <title>Democrats&#39; midterm sweep fuels $750 billion Big Tech rally - Reuters</title>
      <link>https://news.google.com/rss/articles/abc?oc=5</link>
      <pubDate>Wed, 04 Nov 2026 17:51:52 GMT</pubDate>
      <description>&lt;a href="https://news.google.com/..."&gt;Democrats' midterm sweep...&lt;/a&gt;</description>
      <source url="https://www.reuters.com">Reuters</source>
    </item></channel></rss>`;
    const items = parseFeed(xml, { ...feed, googleNews: true }, NOW);
    expect(items[0].headline).toBe("Democrats' midterm sweep fuels $750 billion Big Tech rally");
    expect(items[0].source).toBe('Reuters');
    expect(items[0].summary).toBe('');
  });

  it('skips items without a usable http link', () => {
    const xml = `<rss><channel><item><title>No link</title></item></channel></rss>`;
    expect(parseFeed(xml, feed, NOW)).toHaveLength(0);
  });
});

describe('parseFeedDate', () => {
  it('treats zone-less Investing.com timestamps as UTC', () => {
    expect(parseFeedDate('2026-11-04 19:12:39', NOW)).toBe(Math.floor(Date.parse('2026-11-04T19:12:39Z') / 1000));
  });
  it('parses RFC-822 with named US zones', () => {
    expect(parseFeedDate('Tue, 03 Nov 2026 23:45:13 EST', NOW)).toBe(Math.floor(Date.parse('2026-11-04T04:45:13Z') / 1000));
  });
  it('falls back to now for garbage', () => {
    expect(parseFeedDate('not a date', NOW)).toBe(Math.floor(NOW / 1000));
  });
});

describe('buildPayload', () => {
  it('de-dupes syndicated headlines across outlets, keeping the newest', () => {
    const items = [
      raw({ headline: 'Oil slides as ceasefire talks resume', source: 'A', datetime: 1000, url: 'https://a.com/1' }),
      raw({ headline: 'Oil Slides as Ceasefire Talks Resume!', source: 'B', datetime: 2000, url: 'https://b.com/1' }),
    ];
    const payload = buildPayload(items, { sourcesOk: 2, failedSources: [], source: 'live' }, NOW);
    expect(payload.items).toHaveLength(1);
    expect(payload.items[0].source).toBe('B');
    expect(headlineKey('Oil Slides as Ceasefire Talks Resume!')).toBe('oil slides as ceasefire talks resume');
  });

  it('keeps AI and crypto out of the Breaking digest and sorts it by recency only', () => {
    const base = Math.floor(NOW / 1000);
    const items = [
      raw({ headline: 'Bitcoin surges past $100K', datetime: base - 60 }),
      raw({ headline: 'Nvidia unveils new GPU', datetime: base - 120, forceCategory: 'ai' }),
      raw({ headline: 'Fed holds rates steady', datetime: base - 6 * 3600 }),
      raw({ headline: 'Iran missile strike rattles markets', datetime: base - 300 }),
      raw({ headline: 'Stocks rally on Wall Street', datetime: base - 900 }),
    ];
    const payload = buildPayload(items, { sourcesOk: 1, failedSources: [], source: 'live' }, NOW);
    const digest = payload.highPriority.map((i) => i.category);
    expect(digest).toEqual(['geopolitics', 'markets', 'fed']);
    for (const c of digest) expect(DIGEST_CATEGORIES).toContain(c);
    expect(payload.counts.crypto).toBe(1);
    expect(payload.counts.ai).toBe(1);
    expect(payload.generatedAt).toBe(new Date(NOW).toISOString());
  });

  it('caps any one category inside the Breaking digest so a busy day cannot crowd out the rest', () => {
    const base = Math.floor(NOW / 1000);
    const items: RawNewsItem[] = [];
    for (let i = 0; i < 20; i++) {
      items.push(raw({ headline: `Democrats win Senate seat number ${i}`, datetime: base - i, url: `https://p.com/${i}` }));
    }
    items.push(raw({ headline: 'Fed holds rates steady', datetime: base - 5000, url: 'https://f.com/1' }));
    const payload = buildPayload(items, { sourcesOk: 1, failedSources: [], source: 'live' }, NOW);
    const politics = payload.highPriority.filter((i) => i.category === 'politics').length;
    expect(politics).toBe(12);
    expect(payload.highPriority.some((i) => i.category === 'fed')).toBe(true);
    // The category tab itself still has all 20.
    expect(payload.counts.politics).toBe(20);
  });
});

describe('freshness helpers', () => {
  it('isPayloadFresh respects the 15-minute window', () => {
    const payload = buildPayload([], { sourcesOk: 0, failedSources: [], source: 'live' }, NOW);
    expect(isPayloadFresh(payload, NOW + 14 * 60 * 1000)).toBe(true);
    expect(isPayloadFresh(payload, NOW + 16 * 60 * 1000)).toBe(false);
  });
  it('formatTimeAgo', () => {
    const t = Math.floor(NOW / 1000);
    expect(formatTimeAgo(t, NOW)).toBe('Just now');
    expect(formatTimeAgo(t - 5 * 60, NOW)).toBe('5m ago');
    expect(formatTimeAgo(t - 3 * 3600, NOW)).toBe('3h ago');
    expect(formatTimeAgo(t - 2 * 86400, NOW)).toBe('2d ago');
  });
});
