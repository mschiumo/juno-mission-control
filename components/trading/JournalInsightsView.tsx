'use client';

import { useState } from 'react';
import { BookOpen, Sparkles, Loader2, AlertCircle, FileText, BarChart3 } from 'lucide-react';

type InsightsPeriod = 'week' | 'month';

interface InsightsResult {
  analysis: string | null;
  message?: string;
  period: string;
  entriesCount: number;
  tradesCount: number;
}

const PERIOD_OPTIONS: { value: InsightsPeriod; label: string }[] = [
  { value: 'week', label: 'This Week' },
  { value: 'month', label: 'This Month' },
];

export default function JournalInsightsView() {
  const [period, setPeriod] = useState<InsightsPeriod>('week');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<InsightsResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function generateReport() {
    setLoading(true);
    setError(null);
    setResult(null);

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

      setResult(data);
    } catch {
      setError('Failed to connect to the server');
    } finally {
      setLoading(false);
    }
  }

  return (
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
                  onClick={() => {
                    setPeriod(opt.value);
                    setResult(null);
                    setError(null);
                  }}
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
            {/* Generate button */}
            <button
              onClick={generateReport}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 bg-[#F97316] hover:bg-[#ea6c08] disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Sparkles className="w-4 h-4" />
              )}
              {loading ? 'Analyzing...' : 'Generate Report'}
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="p-6">
        {/* Default state — no report yet */}
        {!loading && !result && !error && (
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

        {/* Loading state */}
        {loading && (
          <div className="text-center py-10">
            <Loader2 className="w-8 h-8 text-[#F97316] animate-spin mx-auto mb-3" />
            <p className="text-sm text-[#8b949e]">
              Analyzing your journal entries and trade data...
            </p>
            <p className="text-xs text-[#484f58] mt-1">This may take a few seconds.</p>
          </div>
        )}

        {/* Error state */}
        {error && (
          <div className="flex items-start gap-3 p-4 bg-[#f85149]/10 border border-[#f85149]/20 rounded-lg">
            <AlertCircle className="w-5 h-5 text-[#f85149] shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-[#f85149]">Analysis failed</p>
              <p className="text-xs text-[#8b949e] mt-1">{error}</p>
            </div>
          </div>
        )}

        {/* Results */}
        {result && (
          <div className="space-y-4">
            {/* Stats bar */}
            <div className="flex items-center gap-4 text-xs text-[#8b949e]">
              <div className="flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5" />
                <span>{result.entriesCount} journal {result.entriesCount === 1 ? 'entry' : 'entries'}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <BarChart3 className="w-3.5 h-3.5" />
                <span>{result.tradesCount} closed {result.tradesCount === 1 ? 'trade' : 'trades'}</span>
              </div>
            </div>

            {result.analysis ? (
              <>
                {/* AI-generated label */}
                <div className="flex items-center gap-1.5 px-3 py-1.5 bg-[#8957e5]/10 border border-[#8957e5]/20 rounded-lg w-fit">
                  <Sparkles className="w-3.5 h-3.5 text-[#8957e5]" />
                  <span className="text-xs font-medium text-[#8957e5]">AI-Generated Analysis</span>
                </div>

                {/* Analysis content */}
                <div className="prose prose-invert prose-sm max-w-none">
                  <div className="text-sm text-[#c9d1d9] leading-relaxed whitespace-pre-wrap">
                    {result.analysis}
                  </div>
                </div>

                {/* Disclaimer */}
                <p className="text-[10px] text-[#484f58] pt-2 border-t border-[#21262d]">
                  This analysis was generated by AI based on your journal entries and trade data.
                  It is intended as a reflective tool, not financial advice. Always apply your own judgment.
                </p>
              </>
            ) : (
              <div className="text-center py-6">
                <p className="text-sm text-[#8b949e]">
                  {result.message || 'No data available for this period.'}
                </p>
                <p className="text-xs text-[#484f58] mt-1">
                  Try selecting a different time period or add journal entries first.
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
