'use client';

import { useState, useEffect, useRef } from 'react';
import { Quote, RefreshCw } from 'lucide-react';

interface QuoteData {
  quote: string;
  author: string;
  date: string;
}

export default function MotivationalBanner({
  compact = false,
  variant = 'dark'
}: {
  compact?: boolean;
  variant?: 'dark' | 'orange';
}) {
  const [data, setData] = useState<QuoteData | null>(null);
  const [loading, setLoading] = useState(true);
  const [isFallback, setIsFallback] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchQuote = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/daily-quote');
      if (!res.ok) throw new Error('API error');
      const json = await res.json();
      if (json.success && json.data) {
        setData(json.data);
        setIsFallback(!!json.fallback);
      } else {
        throw new Error('No data');
      }
    } catch {
      // Handled server-side; if we get here keep existing data or show nothing
    } finally {
      setLoading(false);
    }
  };

  // Schedule a re-fetch at the next 12:01 AM
  const scheduleNextRefresh = () => {
    const now = new Date();
    const next = new Date();
    next.setDate(now.getDate() + 1);
    next.setHours(0, 1, 0, 0); // 12:01 AM
    const msUntilMidnight = next.getTime() - now.getTime();

    timerRef.current = setTimeout(() => {
      fetchQuote();
      scheduleNextRefresh();
    }, msUntilMidnight);
  };

  useEffect(() => {
    fetchQuote();
    scheduleNextRefresh();
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Compact orange variant (Dashboard)
  if (compact && variant === 'orange') {
    if (loading) {
      return (
        <div className="max-w-md bg-gradient-to-r from-[#ff6b35]/20 via-[#ff8c5a]/20 to-[#ff6b35]/20 border border-[#ff6b35]/30 rounded-lg p-4">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 border-2 border-[#ff6b35] border-t-transparent rounded-full animate-spin" />
            <span className="text-[#ff8c5a] text-xs">Loading...</span>
          </div>
        </div>
      );
    }

    return (
      <div className="max-w-md bg-gradient-to-r from-[#ff6b35]/10 via-[#ff8c5a]/10 to-[#ff6b35]/10 border border-[#ff6b35]/30 rounded-lg p-4">
        <div className="flex items-start gap-2">
          <Quote className="w-4 h-4 text-[#ff6b35] flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm text-white line-clamp-3">
              &ldquo;{data?.quote}&rdquo;
            </p>
            <cite className="text-xs text-[#ff8c5a] not-italic block mt-2">
              — {data?.author}
            </cite>
          </div>
        </div>
      </div>
    );
  }

  // Compact dark variant (Trading tab)
  if (compact) {
    if (loading) {
      return (
        <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-4">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 border-2 border-[#ff6b35] border-t-transparent rounded-full animate-spin" />
            <span className="text-[#8b949e] text-xs">Loading...</span>
          </div>
        </div>
      );
    }

    return (
      <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-4">
        <div className="flex items-start gap-2">
          <Quote className="w-4 h-4 text-[#ff6b35] flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm text-white line-clamp-3">
              &ldquo;{data?.quote}&rdquo;
            </p>
            <cite className="text-xs text-[#8b949e] not-italic block mt-2">
              — {data?.author}
            </cite>
          </div>
        </div>
      </div>
    );
  }

  // Full-width version for Dashboard
  if (loading) {
    return (
      <div className="bg-gradient-to-r from-[#ff6b35]/10 via-[#ff8c5a]/10 to-[#ff6b35]/10 border-y border-[#ff6b35]/20 py-4 md:py-6">
        <div className="max-w-[1600px] mx-auto px-4 flex items-center justify-center gap-3">
          <div className="w-5 h-5 border-2 border-[#ff6b35] border-t-transparent rounded-full animate-spin" />
          <span className="text-[#8b949e] text-sm">Loading today&apos;s inspiration...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gradient-to-r from-[#ff6b35]/10 via-[#ff8c5a]/10 to-[#ff6b35]/10 border-y border-[#ff6b35]/20 py-4 md:py-6">
      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-start gap-3 md:gap-4">
          <div className="p-2 md:p-3 bg-[#ff6b35]/20 rounded-full flex-shrink-0">
            <Quote className="w-5 h-5 md:w-6 md:h-6 text-[#ff6b35]" />
          </div>

          <div className="flex-1 min-w-0">
            <blockquote className="text-lg md:text-xl lg:text-2xl font-medium text-white leading-relaxed">
              &ldquo;{data?.quote}&rdquo;
            </blockquote>
            <div className="flex items-center justify-between mt-2">
              <div>
                <cite className="text-sm md:text-base text-[#ff8c5a] not-italic font-medium">
                  — {data?.author}
                </cite>
                <p className="text-[10px] md:text-xs text-[#8b949e] mt-0.5">
                  Daily Motivational
                  {isFallback && (
                    <span className="text-[#d29922]"> • (Auto-selected)</span>
                  )}
                </p>
              </div>

              <button
                onClick={fetchQuote}
                disabled={loading}
                className="p-2 hover:bg-[#ff6b35]/20 rounded-lg transition-colors"
                title="Refresh quote"
              >
                <RefreshCw className={`w-4 h-4 text-[#8b949e] ${loading ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
