import { NextResponse } from 'next/server';

const SECTORS = [
  { symbol: 'XLK',  name: 'Technology' },
  { symbol: 'XLC',  name: 'Comm. Services' },
  { symbol: 'XLF',  name: 'Financials' },
  { symbol: 'XLI',  name: 'Industrials' },
  { symbol: 'XLE',  name: 'Energy' },
  { symbol: 'XLV',  name: 'Health Care' },
  { symbol: 'XLY',  name: 'Consumer Disc.' },
  { symbol: 'XLP',  name: 'Cons. Staples' },
  { symbol: 'XLB',  name: 'Materials' },
  { symbol: 'XLRE', name: 'Real Estate' },
  { symbol: 'XLU',  name: 'Utilities' },
];

interface SectorItem {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
}

async function fetchSector(symbol: string, name: string): Promise<SectorItem | null> {
  try {
    const res = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=1d`,
      {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
        next: { revalidate: 60 },
      }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const meta = data.chart?.result?.[0]?.meta;
    if (!meta) return null;
    const price = meta.regularMarketPrice || meta.previousClose || 0;
    const prevClose = meta.previousClose || meta.chartPreviousClose || price;
    const change = price - prevClose;
    const changePercent = prevClose > 0 ? (change / prevClose) * 100 : 0;
    if (price <= 0) return null;
    return {
      symbol,
      name,
      price: Number(price.toFixed(2)),
      change: Number(change.toFixed(2)),
      changePercent: Number(changePercent.toFixed(2)),
    };
  } catch {
    return null;
  }
}

function getFallbackData(): SectorItem[] {
  return [
    { symbol: 'XLK',  name: 'Technology',      price: 224.85, change:  2.15, changePercent:  0.97 },
    { symbol: 'XLC',  name: 'Comm. Services',   price:  89.42, change:  0.75, changePercent:  0.85 },
    { symbol: 'XLF',  name: 'Financials',        price:  47.83, change:  0.32, changePercent:  0.67 },
    { symbol: 'XLI',  name: 'Industrials',       price: 138.21, change:  0.48, changePercent:  0.35 },
    { symbol: 'XLB',  name: 'Materials',         price:  89.72, change:  0.22, changePercent:  0.25 },
    { symbol: 'XLV',  name: 'Health Care',       price: 145.67, change:  0.12, changePercent:  0.08 },
    { symbol: 'XLU',  name: 'Utilities',         price:  79.32, change: -0.28, changePercent: -0.35 },
    { symbol: 'XLP',  name: 'Cons. Staples',     price:  80.15, change: -0.35, changePercent: -0.43 },
    { symbol: 'XLY',  name: 'Consumer Disc.',    price: 196.38, change: -1.22, changePercent: -0.62 },
    { symbol: 'XLE',  name: 'Energy',            price:  91.45, change: -0.85, changePercent: -0.92 },
    { symbol: 'XLRE', name: 'Real Estate',       price:  42.85, change: -0.55, changePercent: -1.27 },
  ];
}

export async function GET() {
  const timestamp = new Date().toISOString();
  try {
    const results = await Promise.all(SECTORS.map(s => fetchSector(s.symbol, s.name)));
    let sectors = results.filter((r): r is SectorItem => r !== null);

    const isLive = sectors.length >= 6;
    if (!isLive) sectors = getFallbackData();

    sectors.sort((a, b) => b.changePercent - a.changePercent);

    return NextResponse.json(
      { success: true, data: sectors, timestamp, source: isLive ? 'live' : 'fallback' },
      { headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120' } }
    );
  } catch (error) {
    const fallback = getFallbackData().sort((a, b) => b.changePercent - a.changePercent);
    return NextResponse.json({
      success: true,
      data: fallback,
      timestamp,
      source: 'fallback',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
