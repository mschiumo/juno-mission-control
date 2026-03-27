'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  BookOpen, Sparkles, Loader2, AlertCircle, FileText, BarChart3,
  Archive, ChevronDown, X, TrendingUp, TrendingDown, Brain, Lightbulb,
  ClipboardList,
} from 'lucide-react';

type InsightsPeriod = 'week' | 'month';

interface SavedReport {
  analysis: string;
  period: string;
  periodKey: string;
  periodLabel: string;
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

      {/* Modal content */}
      <div className="relative w-full max-w-lg max-h-[85vh] overflow-y-auto bg-[#161b22] border border-[#30363d] rounded-xl shadow-2xl">
        {/* Modal header */}
        <div className="sticky top-0 bg-[#161b22] border-b border-[#30363d] px-6 py-4 flex items-center justify-between z-10">
          <div>
            <h2 className="text-base font-semibold text-white">{report.periodLabel} Report</h2>
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
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-[#8b949e] hover:text-white hover:bg-[#30363d] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal body */}
        <div className="px-6 py-5 space-y-5">
          {structured ? (
            <>
              {/* Key Takeaway */}
              <div className="p-4 bg-[#F97316]/10 border border-[#F97316]/20 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <Lightbulb className="w-4 h-4 text-[#F97316]" />
                  <span className="text-xs font-semibold text-[#F97316] uppercase tracking-wide">Key Takeaway</span>
                </div>
                <p className="text-sm text-[#c9d1d9] leading-relaxed">{structured.keyTakeaway}</p>
              </div>

              {/* Strengths */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <TrendingUp className="w-4 h-4 text-[#3fb950]" />
                  <span className="text-xs font-semibold text-[#3fb950] uppercase tracking-wide">What&apos;s Working</span>
                </div>
                <ul className="space-y-2">
                  {structured.strengths.map((s, i) => (
                    <li key={i} className="flex items-start gap-2.5 text-sm text-[#c9d1d9]">
                      <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-[#3fb950] flex-shrink-0" />
                      {s}
                    </li>
                  ))}
                </ul>
              </div>

              {/* Improvements */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <TrendingDown className="w-4 h-4 text-[#f85149]" />
                  <span className="text-xs font-semibold text-[#f85149] uppercase tracking-wide">Areas to Improve</span>
                </div>
                <ul className="space-y-2">
                  {structured.improvements.map((s, i) => (
                    <li key={i} className="flex items-start gap-2.5 text-sm text-[#c9d1d9]">
                      <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-[#f85149] flex-shrink-0" />
                      {s}
                    </li>
                  ))}
                </ul>
              </div>

              {/* Patterns */}
              {structured.patterns && structured.patterns.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <Brain className="w-4 h-4 text-[#8957e5]" />
                    <span className="text-xs font-semibold text-[#8957e5] uppercase tracking-wide">Behavioral Patterns</span>
                  </div>
                  <ul className="space-y-2">
                    {structured.patterns.map((s, i) => (
                      <li key={i} className="flex items-start gap-2.5 text-sm text-[#c9d1d9]">
                        <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-[#8957e5] flex-shrink-0" />
                        {s}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          ) : (
            // Fallback: plain text display for older reports
            <div className="text-sm text-[#c9d1d9] leading-relaxed whitespace-pre-wrap">
              {report.analysis}
            </div>
          )}
        </div>

        {/* Modal footer */}
        <div className="px-6 py-3 border-t border-[#21262d]">
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
