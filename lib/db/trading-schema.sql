-- ============================================================================
-- TraderVue Trading Journal - Database Schema
-- 
-- PostgreSQL schema for the trading journal feature including
-- trades, journal entries, daily summaries, and metrics cache.
-- 
-- Compatible with: PostgreSQL 12+, Supabase, Vercel Postgres
-- ============================================================================

-- Enable UUID extension for generating unique IDs
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- ENUM Types
-- ============================================================================

CREATE TYPE trade_side AS ENUM ('LONG', 'SHORT');
CREATE TYPE trade_status AS ENUM ('OPEN', 'CLOSED', 'PARTIAL');
CREATE TYPE strategy_type AS ENUM (
  'DAY_TRADE',
  'SWING_TRADE', 
  'POSITION_TRADE',
  'SCALP',
  'MOMENTUM',
  'BREAKOUT',
  'REVERSAL',
  'TREND_FOLLOWING',
  'OTHER'
);
CREATE TYPE emotion_type AS ENUM (
  'CONFIDENT',
  'NEUTRAL',
  'FEARFUL',
  'GREEDY',
  'IMPATIENT',
  'REVENGEFUL',
  'HOPEFUL',
  'ANXIOUS'
);
CREATE TYPE setup_quality AS ENUM ('EXCELLENT', 'GOOD', 'FAIR', 'POOR');
CREATE TYPE metric_period AS ENUM ('day', 'week', 'month', 'year', 'all');

-- ============================================================================
-- Trades Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS trades (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id TEXT NOT NULL,
  
  -- Trade Details
  symbol VARCHAR(20) NOT NULL,
  side trade_side NOT NULL,
  status trade_status NOT NULL DEFAULT 'OPEN',
  strategy strategy_type NOT NULL DEFAULT 'OTHER',
  
  -- Entry Information
  entry_date TIMESTAMP WITH TIME ZONE NOT NULL,
  entry_price DECIMAL(15, 4) NOT NULL,
  shares DECIMAL(15, 4) NOT NULL,
  entry_notes TEXT,
  
  -- Exit Information
  exit_date TIMESTAMP WITH TIME ZONE,
  exit_price DECIMAL(15, 4),
  exit_notes TEXT,
  
  -- Calculated Fields (can be computed, but stored for performance)
  gross_pnl DECIMAL(15, 2),
  net_pnl DECIMAL(15, 2),
  return_percent DECIMAL(8, 4),
  
  -- Risk Management
  stop_loss DECIMAL(15, 4),
  take_profit DECIMAL(15, 4),
  risk_amount DECIMAL(15, 2),
  risk_percent DECIMAL(6, 2),
  
  -- Journal Fields
  emotion emotion_type,
  setup_quality setup_quality,
  mistakes TEXT[], -- Array of mistake descriptions
  lessons TEXT[], -- Array of lesson descriptions
  tags TEXT[], -- Array of tags
  
  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Related Journal Entry
  journal_entry_id UUID
);

-- Indexes for Trades
CREATE INDEX idx_trades_user_id ON trades(user_id);
CREATE INDEX idx_trades_symbol ON trades(symbol);
CREATE INDEX idx_trades_entry_date ON trades(entry_date);
CREATE INDEX idx_trades_status ON trades(status);
CREATE INDEX idx_trades_strategy ON trades(strategy);
CREATE INDEX idx_trades_user_date ON trades(user_id, entry_date DESC);
CREATE INDEX idx_trades_user_symbol ON trades(user_id, symbol);

-- ============================================================================
-- Trade Journal Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS trade_journal (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id TEXT NOT NULL,
  trade_id UUID NOT NULL REFERENCES trades(id) ON DELETE CASCADE,
  
  -- Pre-Trade Analysis
  pre_trade_analysis TEXT,
  market_conditions TEXT,
  conviction_level INTEGER CHECK (conviction_level >= 1 AND conviction_level <= 10),
  
  -- Post-Trade Review
  post_trade_review TEXT,
  emotions_felt emotion_type[],
  followed_plan BOOLEAN DEFAULT TRUE,
  
  -- Mistakes & Lessons
  mistakes_made TEXT[],
  lessons_learned TEXT[],
  would_take_again BOOLEAN DEFAULT TRUE,
  
  -- Screenshots (URLs to stored images - S3, Supabase Storage, etc.)
  entry_screenshot TEXT,
  exit_screenshot TEXT,
  chart_screenshot TEXT,
  
  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for Trade Journal
CREATE INDEX idx_trade_journal_user_id ON trade_journal(user_id);
CREATE INDEX idx_trade_journal_trade_id ON trade_journal(trade_id);
CREATE UNIQUE INDEX idx_trade_journal_user_trade ON trade_journal(user_id, trade_id);

-- ============================================================================
-- Daily Summary Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS daily_summary (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id TEXT NOT NULL,
  date DATE NOT NULL,
  
  -- Trade Counts
  total_trades INTEGER NOT NULL DEFAULT 0,
  winning_trades INTEGER NOT NULL DEFAULT 0,
  losing_trades INTEGER NOT NULL DEFAULT 0,
  breakeven_trades INTEGER NOT NULL DEFAULT 0,
  
  -- P&L
  gross_pnl DECIMAL(15, 2) NOT NULL DEFAULT 0,
  net_pnl DECIMAL(15, 2) NOT NULL DEFAULT 0,
  fees DECIMAL(15, 2) NOT NULL DEFAULT 0,
  
  -- Performance Metrics
  win_rate DECIMAL(5, 2) DEFAULT 0, -- Percentage
  profit_factor DECIMAL(8, 2) DEFAULT 0,
  average_win DECIMAL(15, 2) DEFAULT 0,
  average_loss DECIMAL(15, 2) DEFAULT 0,
  largest_win DECIMAL(15, 2) DEFAULT 0,
  largest_loss DECIMAL(15, 2) DEFAULT 0,
  
  -- Risk Metrics
  max_drawdown DECIMAL(15, 2) DEFAULT 0,
  risk_reward_ratio DECIMAL(8, 2) DEFAULT 0,
  
  -- Journal Summary
  daily_notes TEXT,
  overall_emotion emotion_type,
  day_rating INTEGER CHECK (day_rating >= 1 AND day_rating <= 10),
  
  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Unique constraint: one summary per user per day
  CONSTRAINT unique_user_daily_summary UNIQUE (user_id, date)
);

-- Indexes for Daily Summary
CREATE INDEX idx_daily_summary_user_id ON daily_summary(user_id);
CREATE INDEX idx_daily_summary_date ON daily_summary(date);
CREATE INDEX idx_daily_summary_user_date ON daily_summary(user_id, date DESC);

-- ============================================================================
-- Metrics Cache Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS metrics_cache (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id TEXT NOT NULL,
  
  -- Time Period
  period metric_period NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  
  -- Trade Statistics
  total_trades INTEGER NOT NULL DEFAULT 0,
  winning_trades INTEGER NOT NULL DEFAULT 0,
  losing_trades INTEGER NOT NULL DEFAULT 0,
  breakeven_trades INTEGER NOT NULL DEFAULT 0,
  
  -- P&L Metrics
  gross_profit DECIMAL(15, 2) NOT NULL DEFAULT 0,
  gross_loss DECIMAL(15, 2) NOT NULL DEFAULT 0,
  net_profit DECIMAL(15, 2) NOT NULL DEFAULT 0,
  total_fees DECIMAL(15, 2) NOT NULL DEFAULT 0,
  
  -- Performance Metrics
  win_rate DECIMAL(5, 2) NOT NULL DEFAULT 0, -- Percentage
  profit_factor DECIMAL(8, 2) NOT NULL DEFAULT 0,
  average_win DECIMAL(15, 2) NOT NULL DEFAULT 0,
  average_loss DECIMAL(15, 2) NOT NULL DEFAULT 0,
  average_trade DECIMAL(15, 2) NOT NULL DEFAULT 0,
  largest_win DECIMAL(15, 2) NOT NULL DEFAULT 0,
  largest_loss DECIMAL(15, 2) NOT NULL DEFAULT 0,
  
  -- Risk Metrics
  max_drawdown DECIMAL(15, 2) NOT NULL DEFAULT 0,
  max_drawdown_percent DECIMAL(8, 4) NOT NULL DEFAULT 0,
  sharpe_ratio DECIMAL(8, 4),
  
  -- Consecutive Stats
  current_win_streak INTEGER NOT NULL DEFAULT 0,
  current_loss_streak INTEGER NOT NULL DEFAULT 0,
  max_win_streak INTEGER NOT NULL DEFAULT 0,
  max_loss_streak INTEGER NOT NULL DEFAULT 0,
  
  -- Strategy Performance (stored as JSON for flexibility)
  strategy_performance JSONB DEFAULT '[]',
  
  -- Time-based Performance (stored as JSON for flexibility)
  hourly_performance JSONB DEFAULT '[]',
  weekday_performance JSONB DEFAULT '[]',
  
  -- Metadata
  calculated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE, -- Cache expiration
  
  -- Unique constraint: one cache entry per user per period per date range
  CONSTRAINT unique_user_metrics_cache UNIQUE (user_id, period, start_date, end_date)
);

-- Indexes for Metrics Cache
CREATE INDEX idx_metrics_cache_user_id ON metrics_cache(user_id);
CREATE INDEX idx_metrics_cache_period ON metrics_cache(period);
CREATE INDEX idx_metrics_cache_expires ON metrics_cache(expires_at);
CREATE INDEX idx_metrics_cache_user_period ON metrics_cache(user_id, period, calculated_at DESC);

-- ============================================================================
-- Triggers for Updated At
-- ============================================================================

-- Function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for all tables
CREATE TRIGGER update_trades_updated_at
  BEFORE UPDATE ON trades
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_trade_journal_updated_at
  BEFORE UPDATE ON trade_journal
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_daily_summary_updated_at
  BEFORE UPDATE ON daily_summary
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- Views
-- ============================================================================

-- View: Open Trades (for quick access to active positions)
CREATE OR REPLACE VIEW open_trades AS
SELECT 
  t.*,
  j.pre_trade_analysis,
  j.conviction_level
FROM trades t
LEFT JOIN trade_journal j ON t.id = j.trade_id
WHERE t.status = 'OPEN';

-- View: Closed Trades with Journal (for performance analysis)
CREATE OR REPLACE VIEW closed_trades_with_journal AS
SELECT 
  t.*,
  j.post_trade_review,
  j.followed_plan,
  j.would_take_again,
  j.mistakes_made,
  j.lessons_learned
FROM trades t
LEFT JOIN trade_journal j ON t.id = j.trade_id
WHERE t.status = 'CLOSED';

-- ============================================================================
-- Row Level Security (RLS) Policies
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE trades ENABLE ROW LEVEL SECURITY;
ALTER TABLE trade_journal ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_summary ENABLE ROW LEVEL SECURITY;
ALTER TABLE metrics_cache ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only access their own trades
CREATE POLICY trades_user_isolation ON trades
  FOR ALL
  USING (user_id = current_setting('app.current_user_id', true));

-- Policy: Users can only access their own journal entries
CREATE POLICY trade_journal_user_isolation ON trade_journal
  FOR ALL
  USING (user_id = current_setting('app.current_user_id', true));

-- Policy: Users can only access their own daily summaries
CREATE POLICY daily_summary_user_isolation ON daily_summary
  FOR ALL
  USING (user_id = current_setting('app.current_user_id', true));

-- Policy: Users can only access their own metrics cache
CREATE POLICY metrics_cache_user_isolation ON metrics_cache
  FOR ALL
  USING (user_id = current_setting('app.current_user_id', true));

-- ============================================================================
-- Comments
-- ============================================================================

COMMENT ON TABLE trades IS 'Stores all trade entries for the trading journal';
COMMENT ON TABLE trade_journal IS 'Stores detailed journal entries for trades including analysis and review';
COMMENT ON TABLE daily_summary IS 'Aggregated daily performance statistics';
COMMENT ON TABLE metrics_cache IS 'Cached performance metrics for faster dashboard loading';

COMMENT ON COLUMN trades.gross_pnl IS 'Gross profit/loss (exit - entry) * shares';
COMMENT ON COLUMN trades.net_pnl IS 'Net profit/loss after fees';
COMMENT ON COLUMN trades.return_percent IS 'Percentage return on the trade';
COMMENT ON COLUMN trades.risk_percent IS 'Percentage of account risked on this trade';

COMMENT ON COLUMN daily_summary.win_rate IS 'Win rate as a percentage (0-100)';
COMMENT ON COLUMN daily_summary.profit_factor IS 'Gross profit / Gross loss (higher is better)';

COMMENT ON COLUMN metrics_cache.sharpe_ratio IS 'Risk-adjusted return metric';
COMMENT ON COLUMN metrics_cache.expires_at IS 'Cache expiration timestamp for automatic refresh';
