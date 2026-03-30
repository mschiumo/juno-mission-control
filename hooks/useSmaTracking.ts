'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type { TickerSmaData } from '@/types/sma-tracking';

const DEFAULT_USER_ID = 'default';
const POLL_INTERVAL_MS = 60_000; // 60s during market hours

interface UseSmaTrackingReturn {
  trackedTickers: string[];
  smaData: Record<string, TickerSmaData>;
  isLoading: boolean;
  toggleTracking: (ticker: string) => Promise<void>;
  isTracked: (ticker: string) => boolean;
}

export default function useSmaTracking(isMarketOpen: boolean): UseSmaTrackingReturn {
  const [trackedTickers, setTrackedTickers] = useState<string[]>([]);
  const [smaData, setSmaData] = useState<Record<string, TickerSmaData>>({});
  const [isLoading, setIsLoading] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Fetch tracked tickers from API
  const fetchTrackedTickers = useCallback(async () => {
    try {
      const res = await fetch(`/api/sma-tracking?userId=${DEFAULT_USER_ID}`);
      const result = await res.json();
      if (result.success) setTrackedTickers(result.data);
    } catch (err) {
      console.error('Error fetching tracked tickers:', err);
    }
  }, []);

  // Fetch SMA data for all tracked tickers
  const fetchSmaData = useCallback(async (tickers: string[]) => {
    if (tickers.length === 0) {
      setSmaData({});
      return;
    }
    setIsLoading(true);
    try {
      const res = await fetch(`/api/sma-tracking/data?tickers=${tickers.join(',')}`);
      const result = await res.json();
      if (result.success) setSmaData(result.data);
    } catch (err) {
      console.error('Error fetching SMA data:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Toggle tracking on/off for a ticker
  const toggleTracking = useCallback(async (ticker: string) => {
    const upper = ticker.toUpperCase();
    const isCurrentlyTracked = trackedTickers.includes(upper);

    try {
      if (isCurrentlyTracked) {
        // Remove
        await fetch(`/api/sma-tracking?ticker=${upper}&userId=${DEFAULT_USER_ID}`, { method: 'DELETE' });
        setTrackedTickers(prev => prev.filter(t => t !== upper));
        setSmaData(prev => {
          const next = { ...prev };
          delete next[upper];
          return next;
        });
      } else {
        // Add
        await fetch('/api/sma-tracking', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ticker: upper, userId: DEFAULT_USER_ID }),
        });
        setTrackedTickers(prev => [...prev, upper]);
        // Immediately fetch SMA data for the new ticker
        fetchSmaData([...trackedTickers, upper]);
      }
    } catch (err) {
      console.error('Error toggling SMA tracking:', err);
    }
  }, [trackedTickers, fetchSmaData]);

  const isTracked = useCallback(
    (ticker: string) => trackedTickers.includes(ticker.toUpperCase()),
    [trackedTickers],
  );

  // Initial load
  useEffect(() => {
    fetchTrackedTickers();
  }, [fetchTrackedTickers]);

  // Fetch SMA data whenever tracked tickers change
  useEffect(() => {
    if (trackedTickers.length > 0) {
      fetchSmaData(trackedTickers);
    }
  }, [trackedTickers, fetchSmaData]);

  // Poll during market hours
  useEffect(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }

    if (isMarketOpen && trackedTickers.length > 0) {
      pollRef.current = setInterval(() => {
        fetchSmaData(trackedTickers);
      }, POLL_INTERVAL_MS);
    }

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [isMarketOpen, trackedTickers, fetchSmaData]);

  return { trackedTickers, smaData, isLoading, toggleTracking, isTracked };
}
