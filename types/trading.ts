// Trading Journal Types

export type TradeSide = 'long' | 'short';

export type TradeStrategy = 
  | 'breakout' 
  | 'pullback' 
  | 'gap' 
  | 'trend_following' 
  | 'mean_reversion' 
  | 'scalp' 
  | 'other';

export type TradeEmotion = 
  | 'confident' 
  | 'fearful' 
  | 'greedy' 
  | 'fomo' 
  | 'patient' 
  | 'impatient' 
  | 'neutral';

export interface Trade {
  id: string;
  userId: string;
  symbol: string;
  side: TradeSide;
  entryPrice: number;
  exitPrice: number | null;
  shares: number;
  entryTime: string;
  exitTime: string | null;
  pnl: number | null;
  fees: number;
  netPnl: number | null;
  strategy: TradeStrategy;
  setupType: string;
  tags: string[];
  emotion: TradeEmotion;
  mistakes: string;
  notes: string;
  screenshots: string[];
  chartUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TradeJournal {
  id: string;
  tradeId: string;
  entryNotes: string;
  exitNotes: string;
  lessons: string;
  mentalState: string;
  marketConditions: string;
}

export interface DailySummary {
  date: string;
  userId: string;
  totalPnl: number;
  numTrades: number;
  winCount: number;
  lossCount: number;
  bestTrade: number;
  worstTrade: number;
  journalEntry: string;
}

export interface TradeMetrics {
  userId: string;
  timeframe: 'daily' | 'weekly' | 'monthly' | 'yearly';
  winRate: number;
  avgWinner: number;
  avgLoser: number;
  profitFactor: number;
  sharpeRatio: number;
  maxDrawdown: number;
  lastUpdated: string;
}

export interface TradeStats {
  totalTrades: number;
  winCount: number;
  lossCount: number;
  winRate: number;
  totalPnl: number;
  avgPnl: number;
  avgWinner: number;
  avgLoser: number;
  profitFactor: number;
  bestTrade: number;
  worstTrade: number;
}

export interface DayPerformance {
  day: string;
  trades: number;
  wins: number;
  losses: number;
  pnl: number;
}

export interface HourPerformance {
  hour: number;
  trades: number;
  wins: number;
  losses: number;
  pnl: number;
}

export interface SymbolPerformance {
  symbol: string;
  trades: number;
  wins: number;
  losses: number;
  winRate: number;
  totalPnl: number;
}

export interface StrategyPerformance {
  strategy: TradeStrategy;
  trades: number;
  wins: number;
  losses: number;
  winRate: number;
  totalPnl: number;
}

export interface TradeFilter {
  startDate?: string;
  endDate?: string;
  symbol?: string;
  side?: TradeSide;
  strategy?: TradeStrategy;
  minPnl?: number;
  maxPnl?: number;
  tags?: string[];
}

export interface TradeImportRow {
  symbol: string;
  side: string;
  entryPrice: number;
  exitPrice: number;
  shares: number;
  entryTime: string;
  exitTime: string;
  fees?: number;
  [key: string]: any;
}

export interface ImportPreview {
  valid: TradeImportRow[];
  invalid: { row: TradeImportRow; error: string }[];
  total: number;
}
