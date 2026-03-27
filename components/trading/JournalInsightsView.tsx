'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  BookOpen, Sparkles, Loader2, AlertCircle, FileText, BarChart3,
  Archive, ChevronDown, X, TrendingUp, TrendingDown, Brain, Lightbulb,
  ClipboardList, Download,
} from 'lucide-react';

type InsightsPeriod = 'week' | 'month';

interface SavedReport {
  analysis: string;
  period: string;
  periodKey: string;
  periodLabel: string;
  periodStart?: string;
  periodEnd?: string;
  entriesCount: number;
  tradesCount: number;
  generatedAt: string;
}

interface ArchivedEntry {
  period: string;
  periodKey: string;
  periodLabel: string;
  generatedAt: string;
}

interface StructuredAnalysis {
  keyTakeaway: string;
  strengths: string[];
  improvements: string[];
  patterns: string[];
}

const PERIOD_OPTIONS: { value: InsightsPeriod; label: string }[] = [
  { value: 'week', label: 'This Week' },
  { value: 'month', label: 'This Month' },
];

function parseAnalysis(raw: string): StructuredAnalysis | null {
  try {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return null;
    const parsed = JSON.parse(match[0]);
    if (parsed.keyTakeaway && parsed.strengths && parsed.improvements) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

async function downloadPdf(report: SavedReport, structured: StructuredAnalysis | null) {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'letter' });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const margin = 48;
  const contentW = W - margin * 2;
  const footerZone = 52; // reserve space at bottom for footer
  const maxY = H - footerZone;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function paintPageBg(d: any) {
    d.setFillColor(13, 17, 23);
    d.rect(0, 0, W, H, 'F');
    d.setFillColor(249, 115, 22);
    d.rect(0, 0, W, 6, 'F');
  }

  function ensureSpace(needed: number, currentY: number): number {
    if (currentY + needed > maxY) {
      doc.addPage();
      paintPageBg(doc);
      return 32;
    }
    return currentY;
  }

  // --- Page 1 background ---
  paintPageBg(doc);

  // --- Header ---
  let y = 44;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(137, 87, 229);
  doc.text('CONFLUENCE TRADING', margin, y);

  y += 28;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(26);
  doc.setTextColor(255, 255, 255);
  // Title with date range for weekly reports
  let title = `${report.periodLabel} Report`;
  if (report.periodStart && report.periodEnd) {
    const fmt = (iso: string) => {
      const d = new Date(iso);
      return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
    };
    title += `  (${fmt(report.periodStart)} - ${fmt(report.periodEnd)})`;
  }
  doc.text(title, margin, y);

  y += 22;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(139, 148, 158);
  const meta = `${report.entriesCount} journal ${report.entriesCount === 1 ? 'entry' : 'entries'}  |  ${report.tradesCount} closed ${report.tradesCount === 1 ? 'trade' : 'trades'}  |  Generated ${new Date(report.generatedAt).toLocaleDateString()}`;
  doc.text(meta, margin, y);

  y += 18;
  doc.setDrawColor(48, 54, 61);
  doc.setLineWidth(0.5);
  doc.line(margin, y, W - margin, y);
  y += 24;

  if (structured) {
    // --- Key Takeaway ---
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10.5);
    const takeawayLines: string[] = doc.splitTextToSize(structured.keyTakeaway, contentW - 40);
    const takeawayH = takeawayLines.length * 14.5 + 48;
    y = ensureSpace(takeawayH, y);

    doc.setFillColor(30, 20, 4);
    doc.roundedRect(margin, y, contentW, takeawayH, 8, 8, 'F');
    doc.setDrawColor(249, 115, 22);
    doc.setLineWidth(0.75);
    doc.roundedRect(margin, y, contentW, takeawayH, 8, 8, 'S');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(249, 115, 22);
    doc.text('KEY TAKEAWAY', margin + 20, y + 22);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10.5);
    doc.setTextColor(201, 209, 217);
    doc.text(takeawayLines, margin + 20, y + 40);

    y += takeawayH + 28;

    // --- Two-column: Strengths + Improvements ---
    const gap = 20;
    const colW = (contentW - gap) / 2;
    const leftX = margin;
    const rightX = margin + colW + gap;
    const textInset = 20; // space after accent bar + padding
    const bulletTextW = colW - textInset - 18; // text width after bullet dot

    // Pre-measure both columns
    const leftMeasure = measureSection(doc, structured.strengths, bulletTextW);
    const rightMeasure = measureSection(doc, structured.improvements, bulletTextW);
    const colH = Math.max(leftMeasure.height, rightMeasure.height);
    y = ensureSpace(colH, y);

    drawSectionCard(doc, leftX, y, colW, colH,
      'WHAT\'S WORKING', [63, 185, 80], structured.strengths, bulletTextW, textInset);
    drawSectionCard(doc, rightX, y, colW, colH,
      'AREAS TO IMPROVE', [248, 81, 73], structured.improvements, bulletTextW, textInset);

    y += colH + 28;

    // --- Patterns (full width) ---
    if (structured.patterns && structured.patterns.length > 0) {
      const patTextW = contentW - textInset - 18;
      const patMeasure = measureSection(doc, structured.patterns, patTextW);
      y = ensureSpace(patMeasure.height, y);
      drawSectionCard(doc, margin, y, contentW, patMeasure.height,
        'BEHAVIORAL PATTERNS', [137, 87, 229], structured.patterns, patTextW, textInset);
      y += patMeasure.height + 28;
    }
  } else {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10.5);
    doc.setTextColor(201, 209, 217);
    const lines: string[] = doc.splitTextToSize(report.analysis, contentW);
    doc.text(lines, margin, y);
  }

  // --- Footer on every page ---
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
    doc.text('AI-generated analysis — intended as a reflective tool, not financial advice.', margin, fy);
    doc.text('Powered by Confluence Trading', W - margin, fy, { align: 'right' });
  }

  // Save
  const periodType = report.period === 'week' ? 'weekly' : 'monthly';
  const filename = `confluence-${periodType}-report-${report.periodKey}.pdf`;
  doc.save(filename);
}

// Measure a section's total height without drawing
function measureSection(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  doc: any,
  items: string[],
  textW: number,
): { height: number; wrappedItems: string[][] } {
  const lineH = 14;
  const itemGap = 10;
  const headerH = 38; // label + gap
  const pad = 16;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  const wrappedItems: string[][] = [];
  let textH = 0;
  for (let i = 0; i < items.length; i++) {
    const lines: string[] = doc.splitTextToSize(items[i], textW);
    wrappedItems.push(lines);
    textH += lines.length * lineH;
    if (i < items.length - 1) textH += itemGap;
  }
  return { height: headerH + textH + pad, wrappedItems };
}

// Draw a section card with accent bar, title, and bullets
function drawSectionCard(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  doc: any,
  x: number, y: number, w: number, h: number,
  title: string, rgb: number[], items: string[],
  textW: number, textInset: number,
) {
  const lineH = 14;
  const itemGap = 10;

  // Card bg + border
  doc.setFillColor(22, 27, 34);
  doc.roundedRect(x, y, w, h, 6, 6, 'F');
  doc.setDrawColor(48, 54, 61);
  doc.setLineWidth(0.5);
  doc.roundedRect(x, y, w, h, 6, 6, 'S');

  // Accent bar (left edge)
  doc.setFillColor(rgb[0], rgb[1], rgb[2]);
  doc.rect(x + 1, y + 6, 3, h - 12, 'F');

  // Title
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(rgb[0], rgb[1], rgb[2]);
  doc.text(title, x + textInset, y + 22);

  // Bullets
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(201, 209, 217);

  let bY = y + 38;
  for (let i = 0; i < items.length; i++) {
    const lines: string[] = doc.splitTextToSize(items[i], textW);

    // Bullet dot
    doc.setFillColor(rgb[0], rgb[1], rgb[2]);
    doc.circle(x + textInset + 3, bY + 3.5, 2.5, 'F');

    // Text
    doc.setTextColor(201, 209, 217);
    doc.text(lines, x + textInset + 12, bY + 7);
    bY += lines.length * lineH;
    if (i < items.length - 1) bY += itemGap;
  }
}

export default function JournalInsightsView() {
  const [period, setPeriod] = useState<InsightsPeriod>('week');
  const [loading, setLoading] = useState(false);
  const [loadingArchive, setLoadingArchive] = useState(false);
  const [report, setReport] = useState<SavedReport | null>(null);
  const [archived, setArchived] = useState<ArchivedEntry[]>([]);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [initialLoading, setInitialLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalReport, setModalReport] = useState<SavedReport | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close archive dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setArchiveOpen(false);
      }
    }
    if (archiveOpen) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [archiveOpen]);

  const fetchSavedReport = useCallback(async (p: InsightsPeriod) => {
    try {
      const res = await fetch(`/api/journal-insights?period=${p}`);
      const data = await res.json();
      if (data.success) {
        setReport(data.report || null);
        setArchived(data.archived || []);
      }
    } catch {
      // Silent fail on initial load
    } finally {
      setInitialLoading(false);
    }
  }, []);

  useEffect(() => {
    setInitialLoading(true);
    setReport(null);
    setArchived([]);
    setError(null);
    setArchiveOpen(false);
    fetchSavedReport(period);
  }, [period, fetchSavedReport]);

  async function generateReport() {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/journal-insights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ period }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setError(data.error || 'Failed to generate insights');
        return;
      }

      if (data.report) {
        setReport(data.report);
        setModalReport(data.report);
        setModalOpen(true);
      } else if (data.message) {
        setError(data.message);
      }
      // Refresh archive list
      fetchSavedReport(period);
    } catch {
      setError('Failed to connect to the server');
    } finally {
      setLoading(false);
    }
  }

  async function loadArchivedReport(entry: ArchivedEntry) {
    setLoadingArchive(true);
    setError(null);
    setArchiveOpen(false);

    try {
      const res = await fetch('/api/journal-insights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ period: entry.period, archivePeriodKey: entry.periodKey }),
      });

      const data = await res.json();
      if (data.success && data.report) {
        setModalReport(data.report);
        setModalOpen(true);
      } else {
        setError('Could not load archived report');
      }
    } catch {
      setError('Failed to connect to the server');
    } finally {
      setLoadingArchive(false);
    }
  }

  function openReport(r: SavedReport) {
    setModalReport(r);
    setModalOpen(true);
  }

  return (
    <>
      <div className="bg-[#161b22] border border-[#30363d] rounded-xl overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-[#30363d]">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-[#F97316]" />
              <div>
                <p className="text-sm font-semibold text-white">Journal Insights</p>
                <p className="text-xs text-[#8b949e]">
                  AI-powered analysis of your journal entries and trade patterns
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {/* Period selector */}
              <div className="flex items-center gap-1 bg-[#0d1117] rounded-lg p-1 border border-[#30363d]">
                {PERIOD_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setPeriod(opt.value)}
                    className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                      period === opt.value
                        ? 'bg-[#F97316] text-white'
                        : 'text-[#8b949e] hover:text-white hover:bg-[#30363d]'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              {/* Archive dropdown */}
              {archived.length > 0 && (
                <div className="relative" ref={dropdownRef}>
                  <button
                    onClick={() => setArchiveOpen(!archiveOpen)}
                    className="flex items-center gap-1.5 px-3 py-2 bg-[#0d1117] border border-[#30363d] text-[#8b949e] hover:text-white text-xs font-medium rounded-lg transition-colors"
                  >
                    <Archive className="w-3.5 h-3.5" />
                    <span>Past Reports</span>
                    <ChevronDown className={`w-3 h-3 transition-transform ${archiveOpen ? 'rotate-180' : ''}`} />
                  </button>
                  {archiveOpen && (
                    <div className="absolute right-0 top-full mt-1 w-56 bg-[#1c2128] border border-[#30363d] rounded-lg shadow-xl z-20 py-1">
                      {archived.map((entry) => (
                        <button
                          key={`${entry.period}-${entry.periodKey}`}
                          onClick={() => loadArchivedReport(entry)}
                          className="w-full text-left px-3 py-2 text-xs hover:bg-[#30363d] transition-colors"
                        >
                          <span className="text-[#c9d1d9]">{entry.periodLabel}</span>
                          <span className="block text-[#484f58] mt-0.5">
                            Generated {new Date(entry.generatedAt).toLocaleDateString()}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Generate button */}
              <button
                onClick={generateReport}
                disabled={loading || loadingArchive}
                className="flex items-center gap-2 px-4 py-2 bg-[#F97316] hover:bg-[#ea6c08] disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
              >
                {loading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Sparkles className="w-4 h-4" />
                )}
                {loading ? 'Analyzing...' : report ? 'Regenerate' : 'Generate Report'}
              </button>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-6">
          {/* Initial loading */}
          {initialLoading && (
            <div className="text-center py-10">
              <Loader2 className="w-6 h-6 text-[#8b949e] animate-spin mx-auto mb-2" />
              <p className="text-xs text-[#484f58]">Loading saved report...</p>
            </div>
          )}

          {/* Loading generation */}
          {!initialLoading && (loading || loadingArchive) && (
            <div className="text-center py-10">
              <Loader2 className="w-8 h-8 text-[#F97316] animate-spin mx-auto mb-3" />
              <p className="text-sm text-[#8b949e]">
                {loadingArchive ? 'Loading archived report...' : 'Analyzing your journal entries and trade data...'}
              </p>
              {loading && (
                <p className="text-xs text-[#484f58] mt-1">This may take a few seconds.</p>
              )}
            </div>
          )}

          {/* Error */}
          {error && !loading && (
            <div className="flex items-start gap-3 p-4 bg-[#f85149]/10 border border-[#f85149]/20 rounded-lg">
              <AlertCircle className="w-5 h-5 text-[#f85149] shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-[#f85149]">Analysis failed</p>
                <p className="text-xs text-[#8b949e] mt-1">{error}</p>
              </div>
            </div>
          )}

          {/* No report yet */}
          {!initialLoading && !loading && !loadingArchive && !report && !error && (
            <div className="text-center py-10">
              <BookOpen className="w-10 h-10 text-[#30363d] mx-auto mb-3" />
              <p className="text-sm text-[#8b949e] mb-1">
                Generate a report to get AI-powered insights from your journal entries and trades.
              </p>
              <p className="text-xs text-[#484f58]">
                Select a time period and click &quot;Generate Report&quot; to start.
              </p>
            </div>
          )}

          {/* Report tile */}
          {!initialLoading && !loading && !loadingArchive && report && (
            <button
              onClick={() => openReport(report)}
              className="w-full text-left group"
            >
              <div className="flex items-center gap-4 p-4 bg-[#0d1117] border border-[#30363d] rounded-lg hover:border-[#F97316]/50 transition-colors">
                <div className="flex-shrink-0 w-12 h-12 bg-[#F97316]/10 border border-[#F97316]/20 rounded-lg flex items-center justify-center group-hover:bg-[#F97316]/20 transition-colors">
                  <ClipboardList className="w-6 h-6 text-[#F97316]" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white">
                    {report.periodLabel} Report
                  </p>
                  <div className="flex items-center gap-3 mt-1 text-xs text-[#8b949e]">
                    <span className="flex items-center gap-1">
                      <FileText className="w-3 h-3" />
                      {report.entriesCount} {report.entriesCount === 1 ? 'entry' : 'entries'}
                    </span>
                    <span className="flex items-center gap-1">
                      <BarChart3 className="w-3 h-3" />
                      {report.tradesCount} {report.tradesCount === 1 ? 'trade' : 'trades'}
                    </span>
                    <span className="text-[#484f58]">
                      {new Date(report.generatedAt).toLocaleDateString()}
                    </span>
                  </div>
                </div>
                <Sparkles className="w-4 h-4 text-[#8b949e] group-hover:text-[#F97316] transition-colors flex-shrink-0" />
              </div>
            </button>
          )}
        </div>
      </div>

      {/* Modal */}
      {modalOpen && modalReport && (
        <ReportModal report={modalReport} onClose={() => setModalOpen(false)} />
      )}
    </>
  );
}

function ReportModal({ report, onClose }: { report: SavedReport; onClose: () => void }) {
  const structured = parseAnalysis(report.analysis);

  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Modal content — wide */}
      <div className="relative w-full max-w-4xl max-h-[90vh] overflow-y-auto bg-[#161b22] border border-[#30363d] rounded-xl shadow-2xl">
        {/* Modal header */}
        <div className="sticky top-0 bg-[#161b22] border-b border-[#30363d] px-8 py-5 flex items-center justify-between z-10">
          <div>
            <h2 className="text-lg font-semibold text-white">{report.periodLabel} Report</h2>
            <div className="flex items-center gap-3 mt-1 text-xs text-[#8b949e]">
              <span className="flex items-center gap-1">
                <FileText className="w-3 h-3" />
                {report.entriesCount} {report.entriesCount === 1 ? 'entry' : 'entries'}
              </span>
              <span className="flex items-center gap-1">
                <BarChart3 className="w-3 h-3" />
                {report.tradesCount} {report.tradesCount === 1 ? 'trade' : 'trades'}
              </span>
              <span className="text-[#484f58]">
                {new Date(report.generatedAt).toLocaleDateString()}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => downloadPdf(report, structured)}
              className="flex items-center gap-2 px-3 py-1.5 bg-[#21262d] border border-[#30363d] text-[#c9d1d9] hover:text-white hover:border-[#8b949e] text-xs font-medium rounded-lg transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              Download PDF
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-[#8b949e] hover:text-white hover:bg-[#30363d] transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal body */}
        <div className="px-8 py-6">
          {structured ? (
            <div className="space-y-6">
              {/* Key Takeaway — full width card */}
              <div className="p-5 bg-[#F97316]/10 border border-[#F97316]/20 rounded-lg">
                <div className="flex items-center gap-2 mb-2.5">
                  <Lightbulb className="w-4 h-4 text-[#F97316]" />
                  <span className="text-xs font-semibold text-[#F97316] uppercase tracking-wide">Key Takeaway</span>
                </div>
                <p className="text-sm text-[#c9d1d9] leading-relaxed">{structured.keyTakeaway}</p>
              </div>

              {/* Two-column grid: Strengths + Improvements */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Strengths */}
                <div className="bg-[#0d1117] border border-[#30363d] rounded-lg p-5 border-l-[3px] border-l-[#3fb950]">
                  <div className="flex items-center gap-2 mb-4">
                    <TrendingUp className="w-4 h-4 text-[#3fb950]" />
                    <span className="text-xs font-semibold text-[#3fb950] uppercase tracking-wide">What&apos;s Working</span>
                  </div>
                  <ul className="space-y-3">
                    {structured.strengths.map((s, i) => (
                      <li key={i} className="flex items-start gap-2.5 text-sm text-[#c9d1d9] leading-relaxed">
                        <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-[#3fb950] flex-shrink-0" />
                        {s}
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Improvements */}
                <div className="bg-[#0d1117] border border-[#30363d] rounded-lg p-5 border-l-[3px] border-l-[#f85149]">
                  <div className="flex items-center gap-2 mb-4">
                    <TrendingDown className="w-4 h-4 text-[#f85149]" />
                    <span className="text-xs font-semibold text-[#f85149] uppercase tracking-wide">Areas to Improve</span>
                  </div>
                  <ul className="space-y-3">
                    {structured.improvements.map((s, i) => (
                      <li key={i} className="flex items-start gap-2.5 text-sm text-[#c9d1d9] leading-relaxed">
                        <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-[#f85149] flex-shrink-0" />
                        {s}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* Patterns — full width */}
              {structured.patterns && structured.patterns.length > 0 && (
                <div className="bg-[#0d1117] border border-[#30363d] rounded-lg p-5 border-l-[3px] border-l-[#8957e5]">
                  <div className="flex items-center gap-2 mb-4">
                    <Brain className="w-4 h-4 text-[#8957e5]" />
                    <span className="text-xs font-semibold text-[#8957e5] uppercase tracking-wide">Behavioral Patterns</span>
                  </div>
                  <ul className="space-y-3">
                    {structured.patterns.map((s, i) => (
                      <li key={i} className="flex items-start gap-2.5 text-sm text-[#c9d1d9] leading-relaxed">
                        <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-[#8957e5] flex-shrink-0" />
                        {s}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ) : (
            <div className="text-sm text-[#c9d1d9] leading-relaxed whitespace-pre-wrap">
              {report.analysis}
            </div>
          )}
        </div>

        {/* Modal footer */}
        <div className="px-8 py-3 border-t border-[#21262d]">
          <div className="flex items-center gap-1.5">
            <Sparkles className="w-3 h-3 text-[#8957e5]" />
            <span className="text-[10px] text-[#484f58]">
              AI-generated analysis — intended as a reflective tool, not financial advice.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
