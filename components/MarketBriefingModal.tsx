'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  X,
  Download,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Minus,
  Newspaper,
  Zap,
  BarChart3,
  Bitcoin,
} from 'lucide-react';

interface MarketItem {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  status: 'up' | 'down' | 'flat';
}

interface AiSummary {
  marketOverview: string;
  bigMovers: { symbol: string; move: string; reason: string }[];
  newsHighlights: string[];
  upcomingEvents: string[];
  sentiment: 'bullish' | 'bearish' | 'neutral' | 'mixed';
}

interface BriefingData {
  date: string;
  generatedAt: string;
  indices: MarketItem[];
  stocks: MarketItem[];
  crypto: MarketItem[];
  aiSummary: AiSummary;
}

interface MarketBriefingModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const SENTIMENT_CONFIG = {
  bullish: { label: 'Bullish', color: 'text-[#3fb950]', bg: 'bg-[#3fb950]/10', border: 'border-[#3fb950]/30' },
  bearish: { label: 'Bearish', color: 'text-[#f85149]', bg: 'bg-[#f85149]/10', border: 'border-[#f85149]/30' },
  neutral: { label: 'Neutral', color: 'text-[#8b949e]', bg: 'bg-[#8b949e]/10', border: 'border-[#8b949e]/30' },
  mixed: { label: 'Mixed', color: 'text-[#d29922]', bg: 'bg-[#d29922]/10', border: 'border-[#d29922]/30' },
};

function ChangeIndicator({ item }: { item: MarketItem }) {
  const isUp = item.change >= 0;
  const sign = isUp ? '+' : '';
  const color = isUp ? 'text-[#3fb950]' : 'text-[#f85149]';
  const Icon = item.change > 0 ? TrendingUp : item.change < 0 ? TrendingDown : Minus;

  return (
    <div className="flex items-center justify-between py-2 px-3 bg-[#0d1117] rounded-lg border border-[#21262d]">
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-xs text-[#8b949e] font-mono w-10 flex-shrink-0">{item.symbol}</span>
        <span className="text-sm text-[#e6edf3] truncate">{item.name}</span>
      </div>
      <div className="flex items-center gap-3 flex-shrink-0">
        <span className="text-sm text-[#e6edf3] font-medium tabular-nums">
          ${item.symbol === 'BTC' || item.symbol === 'ETH' ? item.price.toLocaleString() : item.price.toFixed(2)}
        </span>
        <div className={`flex items-center gap-1 ${color}`}>
          <Icon className="w-3 h-3" />
          <span className="text-xs font-medium tabular-nums">
            {sign}{item.changePercent}%
          </span>
        </div>
      </div>
    </div>
  );
}

async function downloadBriefingPdf(briefing: BriefingData) {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'letter' });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const margin = 48;
  const contentW = W - margin * 2;
  const footerZone = 52;
  const maxY = H - footerZone;

  function paintPageBg() {
    doc.setFillColor(13, 17, 23);
    doc.rect(0, 0, W, H, 'F');
    doc.setFillColor(249, 115, 22);
    doc.rect(0, 0, W, 6, 'F');
  }

  function ensureSpace(needed: number, currentY: number): number {
    if (currentY + needed > maxY) {
      doc.addPage();
      paintPageBg();
      return 32;
    }
    return currentY;
  }

  paintPageBg();

  // Header
  let y = 44;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(249, 115, 22);
  doc.text('CONFLUENCE TRADING', margin, y);

  y += 28;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(26);
  doc.setTextColor(255, 255, 255);
  doc.text('Morning Market Briefing', margin, y);

  y += 22;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(139, 148, 158);
  const genDate = new Date(briefing.generatedAt);
  doc.text(
    `${briefing.date}  |  Generated ${genDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: 'America/New_York' })} ET`,
    margin,
    y,
  );

  y += 18;
  doc.setDrawColor(48, 54, 61);
  doc.setLineWidth(0.5);
  doc.line(margin, y, W - margin, y);
  y += 24;

  // Market Overview box
  const sentimentLabel = SENTIMENT_CONFIG[briefing.aiSummary.sentiment]?.label || 'Neutral';
  const overviewLines: string[] = doc.splitTextToSize(briefing.aiSummary.marketOverview, contentW - 48);
  const overviewH = overviewLines.length * 14.5 + 56;
  y = ensureSpace(overviewH, y);

  doc.setFillColor(30, 20, 4);
  doc.roundedRect(margin, y, contentW, overviewH, 8, 8, 'F');
  doc.setDrawColor(249, 115, 22);
  doc.setLineWidth(0.75);
  doc.roundedRect(margin, y, contentW, overviewH, 8, 8, 'S');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(249, 115, 22);
  doc.text(`MARKET OVERVIEW  •  ${sentimentLabel.toUpperCase()}`, margin + 20, y + 22);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10.5);
  doc.setTextColor(201, 209, 217);
  doc.text(overviewLines, margin + 20, y + 42);
  y += overviewH + 24;

  // Indices + Crypto side by side
  const gap = 20;
  const colW = (contentW - gap) / 2;

  const indicesRows = briefing.indices.length;
  const cryptoRows = briefing.crypto.length;
  const rowH = 18;
  const headerH = 36;
  const indicesH = headerH + indicesRows * rowH + 16;
  const cryptoH = headerH + cryptoRows * rowH + 16;
  const sectionH = Math.max(indicesH, cryptoH);
  y = ensureSpace(sectionH, y);

  // Indices column
  doc.setFillColor(22, 27, 34);
  doc.roundedRect(margin, y, colW, sectionH, 6, 6, 'F');
  doc.setDrawColor(48, 54, 61);
  doc.setLineWidth(0.5);
  doc.roundedRect(margin, y, colW, sectionH, 6, 6, 'S');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(139, 148, 158);
  doc.text('MAJOR INDICES', margin + 14, y + 22);
  let iy = y + headerH;
  for (const item of briefing.indices) {
    const sign = item.change >= 0 ? '+' : '';
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.setTextColor(230, 237, 243);
    doc.text(`${item.symbol}`, margin + 14, iy);
    doc.text(`$${item.price.toFixed(2)}`, margin + colW / 2, iy);
    doc.setTextColor(item.change >= 0 ? 63 : 248, item.change >= 0 ? 185 : 81, item.change >= 0 ? 80 : 73);
    doc.text(`${sign}${item.changePercent}%`, margin + colW - 14, iy, { align: 'right' });
    iy += rowH;
  }

  // Crypto column
  const rightX = margin + colW + gap;
  doc.setFillColor(22, 27, 34);
  doc.roundedRect(rightX, y, colW, sectionH, 6, 6, 'F');
  doc.setDrawColor(48, 54, 61);
  doc.roundedRect(rightX, y, colW, sectionH, 6, 6, 'S');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(139, 148, 158);
  doc.text('CRYPTO', rightX + 14, y + 22);
  let cy = y + headerH;
  for (const item of briefing.crypto) {
    const sign = item.change >= 0 ? '+' : '';
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.setTextColor(230, 237, 243);
    doc.text(`${item.symbol}`, rightX + 14, cy);
    doc.text(`$${item.price.toLocaleString()}`, rightX + colW / 2, cy);
    doc.setTextColor(item.change >= 0 ? 63 : 248, item.change >= 0 ? 185 : 81, item.change >= 0 ? 80 : 73);
    doc.text(`${sign}${item.changePercent}%`, rightX + colW - 14, cy, { align: 'right' });
    cy += rowH;
  }
  y += sectionH + 24;

  // Big Movers
  if (briefing.aiSummary.bigMovers.length > 0) {
    const moverLines = briefing.aiSummary.bigMovers
      .map((m) => `${m.symbol} ${m.move} — ${m.reason}`);
    let totalMoverH = headerH;
    for (const line of moverLines) {
      const wrapped: string[] = doc.splitTextToSize(`• ${line}`, contentW - 40);
      totalMoverH += wrapped.length * 14 + 4;
    }
    totalMoverH += 8;
    y = ensureSpace(totalMoverH, y);

    doc.setFillColor(22, 27, 34);
    doc.roundedRect(margin, y, contentW, totalMoverH, 6, 6, 'F');
    doc.setDrawColor(48, 54, 61);
    doc.roundedRect(margin, y, contentW, totalMoverH, 6, 6, 'S');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(139, 148, 158);
    doc.text('BIG MOVERS', margin + 14, y + 22);
    let my = y + headerH;
    for (const line of moverLines) {
      const wrapped: string[] = doc.splitTextToSize(`• ${line}`, contentW - 40);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9.5);
      doc.setTextColor(201, 209, 217);
      doc.text(wrapped, margin + 14, my);
      my += wrapped.length * 14 + 4;
    }
    y += totalMoverH + 24;
  }

  // News Highlights
  if (briefing.aiSummary.newsHighlights.length > 0) {
    let totalNewsH = headerH;
    for (const hl of briefing.aiSummary.newsHighlights) {
      const wrapped: string[] = doc.splitTextToSize(`• ${hl}`, contentW - 40);
      totalNewsH += wrapped.length * 14 + 4;
    }
    totalNewsH += 8;
    y = ensureSpace(totalNewsH, y);

    doc.setFillColor(22, 27, 34);
    doc.roundedRect(margin, y, contentW, totalNewsH, 6, 6, 'F');
    doc.setDrawColor(48, 54, 61);
    doc.roundedRect(margin, y, contentW, totalNewsH, 6, 6, 'S');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(139, 148, 158);
    doc.text('NEWS HIGHLIGHTS', margin + 14, y + 22);
    let ny = y + headerH;
    for (const hl of briefing.aiSummary.newsHighlights) {
      const wrapped: string[] = doc.splitTextToSize(`• ${hl}`, contentW - 40);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9.5);
      doc.setTextColor(201, 209, 217);
      doc.text(wrapped, margin + 14, ny);
      ny += wrapped.length * 14 + 4;
    }
    y += totalNewsH + 24;
  }

  // Upcoming Events
  if (briefing.aiSummary.upcomingEvents.length > 0) {
    let totalEventsH = headerH;
    for (const ev of briefing.aiSummary.upcomingEvents) {
      const wrapped: string[] = doc.splitTextToSize(`• ${ev}`, contentW - 40);
      totalEventsH += wrapped.length * 14 + 4;
    }
    totalEventsH += 8;
    y = ensureSpace(totalEventsH, y);

    doc.setFillColor(22, 27, 34);
    doc.roundedRect(margin, y, contentW, totalEventsH, 6, 6, 'F');
    doc.setDrawColor(210, 153, 34);
    doc.setLineWidth(0.75);
    doc.roundedRect(margin, y, contentW, totalEventsH, 6, 6, 'S');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(210, 153, 34);
    doc.text('WATCH TODAY', margin + 14, y + 22);
    let ey = y + headerH;
    for (const ev of briefing.aiSummary.upcomingEvents) {
      const wrapped: string[] = doc.splitTextToSize(`• ${ev}`, contentW - 40);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9.5);
      doc.setTextColor(201, 209, 217);
      doc.text(wrapped, margin + 14, ey);
      ey += wrapped.length * 14 + 4;
    }
  }

  // Footer on every page
  const pageCount = doc.getNumberOfPages();
  for (let p = 1; p <= pageCount; p++) {
    doc.setPage(p);
    const fy = H - 36;
    doc.setDrawColor(48, 54, 61);
    doc.setLineWidth(0.5);
    doc.line(margin, fy - 12, W - margin, fy - 12);
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(8);
    doc.setTextColor(72, 79, 88);
    doc.text('AI-generated briefing — not financial advice.', margin, fy);
    doc.text('Confluence Trading', W - margin, fy, { align: 'right' });
  }

  const dateStr = briefing.date.replace(/\//g, '-');
  doc.save(`market-briefing-${dateStr}.pdf`);
}

export default function MarketBriefingModal({ isOpen, onClose }: MarketBriefingModalProps) {
  const [briefing, setBriefing] = useState<BriefingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchBriefing = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/market-briefing');
      const data = await res.json();
      if (data.success && data.briefing) {
        setBriefing(data.briefing);
      } else {
        setBriefing(null);
      }
    } catch (err) {
      console.error('Failed to fetch market briefing:', err);
      setError('Failed to load briefing');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      fetchBriefing();
    }
  }, [isOpen, fetchBriefing]);

  if (!isOpen) return null;

  const sentiment = briefing?.aiSummary?.sentiment || 'neutral';
  const sentimentCfg = SENTIMENT_CONFIG[sentiment];

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-[#161b22] border border-[#30363d] rounded-xl w-full max-w-3xl max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-[#1a1f2e] to-[#161b22] border-b border-[#30363d] p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-[#F97316]/10 rounded-xl">
                <Newspaper className="w-6 h-6 text-[#F97316]" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-white">Morning Market Briefing</h2>
                {briefing && (
                  <p className="text-sm text-[#8b949e]">
                    {briefing.date} &middot;{' '}
                    {new Date(briefing.generatedAt).toLocaleTimeString('en-US', {
                      hour: '2-digit',
                      minute: '2-digit',
                      timeZone: 'America/New_York',
                    })}{' '}
                    ET
                  </p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {briefing && (
                <button
                  onClick={() => downloadBriefingPdf(briefing)}
                  className="p-2 hover:bg-[#30363d] rounded-lg transition-colors"
                  title="Download PDF"
                >
                  <Download className="w-5 h-5 text-[#8b949e] hover:text-[#F97316]" />
                </button>
              )}
              <button
                onClick={onClose}
                className="p-2 hover:bg-[#30363d] rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-[#8b949e]" />
              </button>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-180px)]">
          {loading ? (
            <div className="text-center py-12">
              <div className="animate-spin w-8 h-8 border-2 border-[#F97316] border-t-transparent rounded-full mx-auto mb-4" />
              <p className="text-[#8b949e]">Loading briefing...</p>
            </div>
          ) : error ? (
            <div className="text-center py-12">
              <p className="text-[#f85149] mb-4">{error}</p>
              <button
                onClick={fetchBriefing}
                className="flex items-center gap-2 mx-auto px-4 py-2 bg-[#21262d] border border-[#30363d] text-white rounded-lg hover:border-[#8b949e] transition-colors"
              >
                <RefreshCw className="w-4 h-4" />
                Retry
              </button>
            </div>
          ) : !briefing ? (
            <div className="text-center py-12">
              <Newspaper className="w-12 h-12 text-[#30363d] mx-auto mb-4" />
              <p className="text-[#8b949e] text-lg font-medium mb-2">No briefing available yet</p>
              <p className="text-[#484f58] text-sm">
                The morning briefing is generated Mon-Fri at 8:00 AM EST.
              </p>
            </div>
          ) : (
            <div className="space-y-5">
              {/* Sentiment Badge + Market Overview */}
              <div className={`p-4 rounded-xl border ${sentimentCfg.bg} ${sentimentCfg.border}`}>
                <div className="flex items-center gap-2 mb-2">
                  <span className={`text-xs font-bold uppercase tracking-wider ${sentimentCfg.color}`}>
                    {sentimentCfg.label}
                  </span>
                </div>
                <p className="text-sm text-[#e6edf3] leading-relaxed">
                  {briefing.aiSummary.marketOverview}
                </p>
              </div>

              {/* Indices */}
              {briefing.indices.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <BarChart3 className="w-4 h-4 text-[#58a6ff]" />
                    <h3 className="text-sm font-semibold text-white uppercase tracking-wide">Major Indices</h3>
                  </div>
                  <div className="space-y-1.5">
                    {briefing.indices.map((item) => (
                      <ChangeIndicator key={item.symbol} item={item} />
                    ))}
                  </div>
                </div>
              )}

              {/* Key Stocks */}
              {briefing.stocks.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <TrendingUp className="w-4 h-4 text-[#3fb950]" />
                    <h3 className="text-sm font-semibold text-white uppercase tracking-wide">Key Stocks</h3>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                    {briefing.stocks.map((item) => (
                      <ChangeIndicator key={item.symbol} item={item} />
                    ))}
                  </div>
                </div>
              )}

              {/* Crypto */}
              {briefing.crypto.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <Bitcoin className="w-4 h-4 text-[#d29922]" />
                    <h3 className="text-sm font-semibold text-white uppercase tracking-wide">Crypto</h3>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                    {briefing.crypto.map((item) => (
                      <ChangeIndicator key={item.symbol} item={item} />
                    ))}
                  </div>
                </div>
              )}

              {/* Big Movers */}
              {briefing.aiSummary.bigMovers.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <Zap className="w-4 h-4 text-[#F97316]" />
                    <h3 className="text-sm font-semibold text-white uppercase tracking-wide">Big Movers</h3>
                  </div>
                  <div className="space-y-2">
                    {briefing.aiSummary.bigMovers.map((mover, i) => (
                      <div
                        key={i}
                        className="flex items-start gap-3 p-3 bg-[#0d1117] rounded-lg border border-[#21262d]"
                      >
                        <span className="text-xs font-bold font-mono text-[#F97316] bg-[#F97316]/10 px-2 py-0.5 rounded flex-shrink-0">
                          {mover.symbol}
                        </span>
                        <div className="min-w-0">
                          <span className={`text-sm font-semibold ${
                            mover.move.startsWith('+') ? 'text-[#3fb950]' : mover.move.startsWith('-') ? 'text-[#f85149]' : 'text-[#e6edf3]'
                          }`}>
                            {mover.move}
                          </span>
                          <span className="text-sm text-[#8b949e] ml-2">{mover.reason}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* News Highlights */}
              {briefing.aiSummary.newsHighlights.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <Newspaper className="w-4 h-4 text-[#58a6ff]" />
                    <h3 className="text-sm font-semibold text-white uppercase tracking-wide">News Highlights</h3>
                  </div>
                  <div className="space-y-1.5">
                    {briefing.aiSummary.newsHighlights.map((headline, i) => (
                      <div key={i} className="flex items-start gap-2 py-1.5">
                        <span className="text-[#F97316] mt-1 flex-shrink-0">•</span>
                        <span className="text-sm text-[#c9d1d9]">{headline}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Upcoming Events */}
              {briefing.aiSummary.upcomingEvents.length > 0 && (
                <div className="p-4 bg-[#d29922]/5 border border-[#d29922]/20 rounded-xl">
                  <div className="flex items-center gap-2 mb-3">
                    <Zap className="w-4 h-4 text-[#d29922]" />
                    <h3 className="text-sm font-semibold text-[#d29922] uppercase tracking-wide">Watch Today</h3>
                  </div>
                  <div className="space-y-1.5">
                    {briefing.aiSummary.upcomingEvents.map((event, i) => (
                      <div key={i} className="flex items-start gap-2 py-1">
                        <span className="text-[#d29922] mt-0.5 flex-shrink-0 text-sm">⚡</span>
                        <span className="text-sm text-[#c9d1d9]">{event}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
