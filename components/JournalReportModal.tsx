'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  Sparkles, Loader2, AlertCircle, X, TrendingUp, TrendingDown, Brain,
  Lightbulb, FileText, Archive, ChevronDown, BookOpen,
} from 'lucide-react';

type ReportPeriod = 'week' | 'month';

interface SavedReport {
  analysis: string;
  period: string;
  periodKey: string;
  periodLabel: string;
  periodStart?: string;
  periodEnd?: string;
  entriesCount: number;
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

const PERIOD_OPTIONS: { value: ReportPeriod; label: string }[] = [
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

export default function JournalReportModal({ onClose }: { onClose: () => void }) {
  const [period, setPeriod] = useState<ReportPeriod>('month');
  const [loading, setLoading] = useState(false);
  const [loadingArchive, setLoadingArchive] = useState(false);
  const [report, setReport] = useState<SavedReport | null>(null);
  const [archived, setArchived] = useState<ArchivedEntry[]>([]);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [initialLoading, setInitialLoading] = useState(true);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

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

  const fetchSavedReport = useCallback(async (p: ReportPeriod) => {
    try {
      const res = await fetch(`/api/personal-journal-report?period=${p}`);
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
      const res = await fetch('/api/personal-journal-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ period }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error || 'Failed to generate report');
        return;
      }
      if (data.report) {
        setReport(data.report);
      } else if (data.message) {
        setError(data.message);
      }
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
      const res = await fetch('/api/personal-journal-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ period: entry.period, archivePeriodKey: entry.periodKey }),
      });
      const data = await res.json();
      if (data.success && data.report) {
        setReport(data.report);
      } else {
        setError('Could not load archived report');
      }
    } catch {
      setError('Failed to connect to the server');
    } finally {
      setLoadingArchive(false);
    }
  }

  const structured = report ? parseAnalysis(report.analysis) : null;
  const busy = loading || loadingArchive;

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative w-full max-w-3xl max-h-[90vh] overflow-y-auto bg-[#161b22] border border-[#30363d] rounded-xl shadow-2xl">
        {/* Header */}
        <div className="sticky top-0 bg-[#161b22] border-b border-[#30363d] px-6 py-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 z-10">
          <div className="flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-[#F97316]" />
            <div>
              <p className="text-sm font-semibold text-white">Daily Journal Report</p>
              <p className="text-xs text-[#8b949e]">AI-powered insights from your reflections</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Period selector */}
            <div className="flex items-center gap-1 bg-[#0d1117] rounded-lg p-1 border border-[#30363d]">
              {PERIOD_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setPeriod(opt.value)}
                  disabled={busy}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors disabled:opacity-50 ${
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
                  <span className="hidden sm:inline">Past</span>
                  <ChevronDown className={`w-3 h-3 transition-transform ${archiveOpen ? 'rotate-180' : ''}`} />
                </button>
                {archiveOpen && (
                  <div className="absolute right-0 top-full mt-1 w-56 bg-[#1c2128] border border-[#30363d] rounded-lg shadow-xl z-20 py-1 max-h-64 overflow-y-auto">
                    {archived.map((entry) => (
                      <button
                        key={`${entry.period}-${entry.periodKey}`}
                        onClick={() => loadArchivedReport(entry)}
                        className="w-full text-left px-3 py-2 text-xs hover:bg-[#30363d] transition-colors"
                      >
                        <span className="text-[#c9d1d9]">{entry.periodLabel}</span>
                        <span className="block text-[#484f58] mt-0.5">
                          {new Date(entry.generatedAt).toLocaleDateString()}
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
              disabled={busy}
              className="flex items-center gap-2 px-4 py-2 bg-[#F97316] hover:bg-[#ea6c08] disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              {loading ? 'Analyzing...' : report ? 'Regenerate' : 'Generate'}
            </button>

            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-[#8b949e] hover:text-white hover:bg-[#30363d] transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="px-6 py-6">
          {/* Initial loading */}
          {initialLoading && (
            <div className="text-center py-12">
              <Loader2 className="w-6 h-6 text-[#8b949e] animate-spin mx-auto mb-2" />
              <p className="text-xs text-[#484f58]">Loading saved report...</p>
            </div>
          )}

          {/* Generating */}
          {!initialLoading && busy && (
            <div className="text-center py-12">
              <Loader2 className="w-8 h-8 text-[#F97316] animate-spin mx-auto mb-3" />
              <p className="text-sm text-[#8b949e]">
                {loadingArchive ? 'Loading report...' : 'Analyzing your journal entries...'}
              </p>
              {loading && <p className="text-xs text-[#484f58] mt-1">This may take a few seconds.</p>}
            </div>
          )}

          {/* Error / message */}
          {error && !busy && (
            <div className="flex items-start gap-3 p-4 bg-[#f85149]/10 border border-[#f85149]/20 rounded-lg">
              <AlertCircle className="w-5 h-5 text-[#f85149] shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-[#f85149]">Couldn&apos;t generate report</p>
                <p className="text-xs text-[#8b949e] mt-1">{error}</p>
              </div>
            </div>
          )}

          {/* Empty state */}
          {!initialLoading && !busy && !report && !error && (
            <div className="text-center py-12">
              <BookOpen className="w-10 h-10 text-[#30363d] mx-auto mb-3" />
              <p className="text-sm text-[#8b949e] mb-1">No report yet for {period === 'week' ? 'this week' : 'this month'}.</p>
              <p className="text-xs text-[#484f58]">Click &quot;Generate&quot; to analyze your recent journal entries.</p>
            </div>
          )}

          {/* Report */}
          {!initialLoading && !busy && report && (
            <div className="space-y-6">
              <div className="flex items-center gap-3 text-xs text-[#8b949e]">
                <span className="font-medium text-white text-sm">{report.periodLabel}</span>
                <span className="flex items-center gap-1">
                  <FileText className="w-3 h-3" />
                  {report.entriesCount} {report.entriesCount === 1 ? 'entry' : 'entries'}
                </span>
                <span className="text-[#484f58]">{new Date(report.generatedAt).toLocaleDateString()}</span>
              </div>

              {structured ? (
                <>
                  {/* Key Takeaway */}
                  <div className="p-5 bg-[#F97316]/10 border border-[#F97316]/20 rounded-lg">
                    <div className="flex items-center gap-2 mb-2.5">
                      <Lightbulb className="w-4 h-4 text-[#F97316]" />
                      <span className="text-xs font-semibold text-[#F97316] uppercase tracking-wide">Key Takeaway</span>
                    </div>
                    <p className="text-sm text-[#c9d1d9] leading-relaxed">{structured.keyTakeaway}</p>
                  </div>

                  {/* Strengths + Improvements */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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

                    <div className="bg-[#0d1117] border border-[#30363d] rounded-lg p-5 border-l-[3px] border-l-[#f0883e]">
                      <div className="flex items-center gap-2 mb-4">
                        <TrendingDown className="w-4 h-4 text-[#f0883e]" />
                        <span className="text-xs font-semibold text-[#f0883e] uppercase tracking-wide">Areas to Work On</span>
                      </div>
                      <ul className="space-y-3">
                        {structured.improvements.map((s, i) => (
                          <li key={i} className="flex items-start gap-2.5 text-sm text-[#c9d1d9] leading-relaxed">
                            <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-[#f0883e] flex-shrink-0" />
                            {s}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>

                  {/* Patterns */}
                  {structured.patterns && structured.patterns.length > 0 && (
                    <div className="bg-[#0d1117] border border-[#30363d] rounded-lg p-5 border-l-[3px] border-l-[#8957e5]">
                      <div className="flex items-center gap-2 mb-4">
                        <Brain className="w-4 h-4 text-[#8957e5]" />
                        <span className="text-xs font-semibold text-[#8957e5] uppercase tracking-wide">Patterns</span>
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
                </>
              ) : (
                <div className="text-sm text-[#c9d1d9] leading-relaxed whitespace-pre-wrap">
                  {report.analysis}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-[#21262d]">
          <div className="flex items-center gap-1.5">
            <Sparkles className="w-3 h-3 text-[#8957e5]" />
            <span className="text-[10px] text-[#484f58]">
              AI-generated reflection — a tool for self-coaching, not professional advice.
            </span>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
