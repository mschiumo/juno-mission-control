/**
 * SMA Tracking Types
 *
 * Type definitions for the moving average tracking feature.
 * Tracks 20 and 200 period SMAs on 1min, 5min, and 15min timeframes
 * for tickers the user explicitly enables tracking on.
 */

export type SmaTimeframe = '1min' | '5min' | '15min';

export const SMA_TIMEFRAMES: SmaTimeframe[] = ['1min', '5min', '15min'];

export const TIMEFRAME_CONFIG: Record<SmaTimeframe, { multiplier: number; label: string }> = {
  '1min': { multiplier: 1, label: '1 Min' },
  '5min': { multiplier: 5, label: '5 Min' },
  '15min': { multiplier: 15, label: '15 Min' },
};

export interface SmaValue {
  sma20: number | null;
  sma200: number | null;
  currentPrice: number | null;
  timestamp: number;
}

export type SmaSignalType =
  | 'approaching_sma20_from_above'
  | 'approaching_sma20_from_below'
  | 'approaching_sma200_from_above'
  | 'approaching_sma200_from_below'
  | 'crossed_above_sma20'
  | 'crossed_below_sma20'
  | 'crossed_above_sma200'
  | 'crossed_below_sma200'
  | 'golden_cross'
  | 'death_cross';

export interface SmaSignal {
  type: SmaSignalType;
  timeframe: SmaTimeframe;
  description: string;
  severity: 'info' | 'warning' | 'critical';
}

export interface TickerSmaData {
  ticker: string;
  timeframes: Record<SmaTimeframe, SmaValue>;
  signals: SmaSignal[];
  updatedAt: string;
}

/** Proximity threshold: price within 0.5% of an SMA triggers an "approaching" signal */
export const SMA_PROXIMITY_THRESHOLD = 0.005;
