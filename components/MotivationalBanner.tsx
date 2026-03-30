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
        <div className="max-w-lg bg-gradient-to-r from-[#F97316]/[0.06] to-transparent border border-[#F97316]/10 rounded-2xl p-4">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 border-2 border-[#F97316] border-t-transparent rounded-full animate-spin" />
            <span className="text-[#F97316]/70 text-xs">Loading...</span>
          </div>
        </div>
      );
    }

    return (
      <div className="max-w-lg bg-gradient-to-r from-[#F97316]/[0.06] to-transparent border border-[#F97316]/10 rounded-2xl p-4">
        <div className="flex items-start gap-2">
<div className="p-1.5 bg-[#F97316]/10 rounded-lg flex-shrink-0">
            <Quote className="w-4 h-4 text-[#F97316]" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm text-white line-clamp-3 tracking-tight">
              &ldquo;{data?.quote}&rdquo;
            </p>
            <cite className="text-xs text-[#F97316]/70 not-italic block mt-2">
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
        <div className="bg-[#111318] border border-white/[0.06] rounded-2xl p-4">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 border-2 border-[#F97316] border-t-transparent rounded-full animate-spin" />
            <span className="text-[#71717a] text-xs">Loading...</span>
          </div>
        </div>
      );
    }

    return (
      <div className="bg-[#111318] border border-white/[0.06] rounded-2xl p-4">
        <div className="flex items-start gap-2">
<div className="p-1.5 bg-[#F97316]/10 rounded-lg flex-shrink-0">
            <Quote className="w-4 h-4 text-[#F97316]" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm text-white line-clamp-3 tracking-tight">
              &ldquo;{data?.quote}&rdquo;
            </p>
            <cite className="text-xs text-[#71717a] not-italic block mt-2">
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
      <div className="bg-gradient-to-r from-[#F97316]/[0.06] to-transparent border border-[#F97316]/10 rounded-2xl py-4 md:py-6">
        <div className="max-w-[1600px] mx-auto px-4 flex items-center justify-center gap-3">
          <div className="w-5 h-5 border-2 border-[#F97316] border-t-transparent rounded-full animate-spin" />
          <span className="text-[#71717a] text-sm">Loading today&apos;s inspiration...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gradient-to-r from-[#F97316]/[0.06] to-transparent border border-[#F97316]/10 rounded-2xl py-4 md:py-6">
      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-start gap-3 md:gap-4">
          <div className="p-2.5 md:p-3 bg-[#F97316]/10 rounded-xl flex-shrink-0">
            <Quote className="w-5 h-5 md:w-6 md:h-6 text-[#F97316]" />
          </div>

          <div className="flex-1 min-w-0">
            <blockquote className="text-lg md:text-xl lg:text-2xl font-medium text-white leading-relaxed tracking-tight">
              &ldquo;{data?.quote}&rdquo;
            </blockquote>
            <div className="flex items-center justify-between mt-2">
              <div>
                <cite className="text-sm md:text-base text-[#F97316]/80 not-italic font-medium">
                  — {data?.author}
                </cite>
                <p className="text-[10px] md:text-xs text-[#52525b] mt-0.5">
                  Daily Motivational
                  {isFallback && (
                    <span className="text-[#d29922]"> • (Auto-selected)</span>
                  )}
                </p>
              </div>

              <button
                onClick={fetchQuote}
                disabled={loading}
                className="p-2 hover:bg-white/[0.05] rounded-lg transition-colors"
                title="Refresh quote"
              >
                <RefreshCw className={`w-4 h-4 text-[#71717a] ${loading ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
