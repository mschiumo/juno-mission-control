/**
 * TraderVue Trading Journal - TypeScript Types
 * 
 * Core type definitions for the trading journal feature including
 * trades, journal entries, daily summaries, and performance metrics.
 */

// ============================================================================
// Enums
// ============================================================================

export enum TradeSide {
  LONG = 'LONG',
  SHORT = 'SHORT',
}

export enum TradeStatus {
  OPEN = 'OPEN',
  CLOSED = 'CLOSED',
  PARTIAL = 'PARTIAL',
}

export enum Strategy {
  DAY_TRADE = 'DAY_TRADE',
  SWING_TRADE = 'SWING_TRADE',
  POSITION_TRADE = 'POSITION_TRADE',
  SCALP = 'SCALP',
  MOMENTUM = 'MOMENTUM',
  BREAKOUT = 'BREAKOUT',
  REVERSAL = 'REVERSAL',
  TREND_FOLLOWING = 'TREND_FOLLOWING',
  OTHER = 'OTHER',
}

export enum Emotion {
  CONFIDENT = 'CONFIDENT',
  NEUTRAL = 'NEUTRAL',
  FEARFUL = 'FEARFUL',
  GREEDY = 'GREEDY',
  IMPATIENT = 'IMPATIENT',
  REVENGEFUL = 'REVENGEFUL',
  HOPEFUL = 'HOPEFUL',
  ANXIOUS = 'ANXIOUS',
}

export enum SetupQuality {
  EXCELLENT = 'EXCELLENT',
  GOOD = 'GOOD',
  FAIR = 'FAIR',
  POOR = 'POOR',
}

// ============================================================================
// Core Trade Interface
// ============================================================================

export interface Trade {
  id: string;
  userId: string;
  
  // Trade Details
  symbol: string;
  side: TradeSide;
  status: TradeStatus;
  strategy: Strategy;
  
  // Entry Information
  entryDate: string; // ISO 8601
  entryPrice: number;
  shares: number;
  entryNotes?: string;
  
  // Exit Information
  exitDate?: string; // ISO 8601
  exitPrice?: number;
  exitNotes?: string;
  
  // Calculated Fields
  grossPnL?: number;
  netPnL?: number;
  returnPercent?: number;
  
  // Risk Management
  stopLoss?: number;
  takeProfit?: number;
  riskAmount?: number;
  riskPercent?: number;
  
  // Journal Fields
  emotion?: Emotion;
  setupQuality?: SetupQuality;
  mistakes?: string[];
  lessons?: string[];
  tags?: string[];
  
  // Metadata
  createdAt: string;
  updatedAt: string;
  
  // Related Journal Entry
  journalEntryId?: string;
}

// ============================================================================
// Trade Journal Interface
// ============================================================================

export interface TradeJournal {
  id: string;
  userId: string;
  tradeId: string;
  
  // Pre-Trade Analysis
  preTradeAnalysis?: string;
  marketConditions?: string;
  convictionLevel?: number; // 1-10
  
  // Post-Trade Review
  postTradeReview?: string;
  emotionsFelt?: Emotion[];
  followedPlan: boolean;
  
  // Mistakes & Lessons
  mistakesMade?: string[];
  lessonsLearned?: string[];
  wouldTakeAgain: boolean;
  
  // Screenshots (URLs to stored images)
  entryScreenshot?: string;
  exitScreenshot?: string;
  chartScreenshot?: string;
  
  // Metadata
  createdAt: string;
  updatedAt: string;
}

// ============================================================================
// Daily Summary Interface
// ============================================================================

export interface DailySummary {
  id: string;
  userId: string;
  date: string; // YYYY-MM-DD
  
  // Trade Counts
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  breakevenTrades: number;
  
  // P&L
  grossPnL: number;
  netPnL: number;
  fees: number;
  
  // Performance Metrics
  winRate: number;
  profitFactor: number;
  averageWin: number;
  averageLoss: number;
  largestWin: number;
  largestLoss: number;
  
  // Risk Metrics
  maxDrawdown: number;
  riskRewardRatio: number;
  
  // Journal Summary
  dailyNotes?: string;
  overallEmotion?: Emotion;
  dayRating?: number; // 1-10
  
  // Metadata
  createdAt: string;
  updatedAt: string;
}

// ============================================================================
// Metrics Interface
// ============================================================================

export interface Metrics {
  id: string;
  userId: string;
  
  // Time Period
  period: 'day' | 'week' | 'month' | 'year' | 'all';
  startDate: string;
  endDate: string;
  
  // Trade Statistics
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  breakevenTrades: number;
  
  // P&L Metrics
  grossProfit: number;
  grossLoss: number;
  netProfit: number;
  totalFees: number;
  
  // Performance Metrics
  winRate: number; // percentage
  profitFactor: number;
  averageWin: number;
  averageLoss: number;
  averageTrade: number;
  largestWin: number;
  largestLoss: number;
  
  // Risk Metrics
  maxDrawdown: number;
  maxDrawdownPercent: number;
  sharpeRatio?: number;
  
  // Consecutive Stats
  currentWinStreak: number;
  currentLossStreak: number;
  maxWinStreak: number;
  maxLossStreak: number;
  
  // Strategy Performance
  strategyPerformance: StrategyMetrics[];
  
  // Time-based Performance
  hourlyPerformance: HourlyMetrics[];
  weekdayPerformance: WeekdayMetrics[];
  
  // Metadata
  calculatedAt: string;
  expiresAt?: string;
}

export interface StrategyMetrics {
  strategy: Strategy;
  tradeCount: number;
  winRate: number;
  netProfit: number;
  averageTrade: number;
}

export interface HourlyMetrics {
  hour: number; // 0-23
  tradeCount: number;
  winRate: number;
  netProfit: number;
}

export interface WeekdayMetrics {
  day: number; // 0-6 (Sunday-Saturday)
  dayName: string;
  tradeCount: number;
  winRate: number;
  netProfit: number;
}

// ============================================================================
// CSV Import Types
// ============================================================================

export interface CSVImportMapping {
  symbol: string;
  side: string;
  entryDate: string;
  entryPrice: string;
  exitDate?: string;
  exitPrice?: string;
  shares: string;
  fees?: string;
  notes?: string;
}

export interface CSVImportResult {
  success: boolean;
  imported: number;
  failed: number;
  errors: CSVImportError[];
  trades: Trade[];
}

export interface CSVImportError {
  row: number;
  message: string;
  data: Record<string, string>;
}

// ============================================================================
// API Request/Response Types
// ============================================================================

export interface CreateTradeRequest {
  userId?: string;
  symbol: string;
  side: TradeSide;
  strategy: Strategy;
  entryDate: string;
  entryPrice: number;
  shares: number;
  entryNotes?: string;
  stopLoss?: number;
  takeProfit?: number;
  riskAmount?: number;
  emotion?: Emotion;
  tags?: string[];
}

export interface UpdateTradeRequest {
  symbol?: string;
  side?: TradeSide;
  strategy?: Strategy;
  entryDate?: string;
  entryPrice?: number;
  shares?: number;
  entryNotes?: string;
  exitDate?: string;
  exitPrice?: number;
  exitNotes?: string;
  stopLoss?: number;
  takeProfit?: number;
  riskAmount?: number;
  emotion?: Emotion;
  setupQuality?: SetupQuality;
  mistakes?: string[];
  lessons?: string[];
  tags?: string[];
  status?: TradeStatus;
}

export interface TradeListResponse {
  trades: Trade[];
  total: number;
  page: number;
  perPage: number;
  hasMore: boolean;
}

export interface TradeStatsResponse {
  period: string;
  metrics: Metrics;
  dailySummaries: DailySummary[];
}

// ============================================================================
// Calendar View Types
// ============================================================================

export interface CalendarTrade {
  date: string;
  trades: Trade[];
  summary: {
    tradeCount: number;
    netPnL: number;
    winRate: number;
  };
}

export interface CalendarMonth {
  month: number;
  year: number;
  days: CalendarTrade[];
  summary: {
    totalTrades: number;
    netPnL: number;
    winRate: number;
  };
}
