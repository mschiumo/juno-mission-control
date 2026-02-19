-- Trading Journal Database Schema
-- Run this to create tables for the TraderVue clone

-- Main trades table
CREATE TABLE trades (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL,
    symbol VARCHAR(20) NOT NULL,
    side VARCHAR(10) NOT NULL CHECK (side IN ('long', 'short')),
    entry_price DECIMAL(12, 4) NOT NULL,
    exit_price DECIMAL(12, 4),
    shares INTEGER NOT NULL,
    entry_time TIMESTAMP WITH TIME ZONE NOT NULL,
    exit_time TIMESTAMP WITH TIME ZONE,
    pnl DECIMAL(12, 4),
    fees DECIMAL(12, 4) DEFAULT 0,
    net_pnl DECIMAL(12, 4),
    strategy VARCHAR(50),
    setup_type VARCHAR(100),
    tags TEXT[],
    emotion VARCHAR(50),
    mistakes TEXT,
    notes TEXT,
    screenshots TEXT[],
    chart_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Trade journal entries
CREATE TABLE trade_journal (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trade_id UUID REFERENCES trades(id) ON DELETE CASCADE,
    entry_notes TEXT,
    exit_notes TEXT,
    lessons TEXT,
    mental_state TEXT,
    market_conditions TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Daily summary cache
CREATE TABLE daily_summary (
    date DATE NOT NULL,
    user_id TEXT NOT NULL,
    total_pnl DECIMAL(12, 4) DEFAULT 0,
    num_trades INTEGER DEFAULT 0,
    win_count INTEGER DEFAULT 0,
    loss_count INTEGER DEFAULT 0,
    best_trade DECIMAL(12, 4),
    worst_trade DECIMAL(12, 4),
    journal_entry TEXT,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    PRIMARY KEY (date, user_id)
);

-- Metrics cache for performance
CREATE TABLE metrics_cache (
    user_id TEXT NOT NULL,
    timeframe VARCHAR(20) NOT NULL CHECK (timeframe IN ('daily', 'weekly', 'monthly', 'yearly')),
    win_rate DECIMAL(5, 2),
    avg_winner DECIMAL(12, 4),
    avg_loser DECIMAL(12, 4),
    profit_factor DECIMAL(8, 2),
    sharpe_ratio DECIMAL(8, 2),
    max_drawdown DECIMAL(12, 4),
    last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    PRIMARY KEY (user_id, timeframe)
);

-- Indexes for performance
CREATE INDEX idx_trades_user_id ON trades(user_id);
CREATE INDEX idx_trades_symbol ON trades(symbol);
CREATE INDEX idx_trades_entry_time ON trades(entry_time);
CREATE INDEX idx_trades_strategy ON trades(strategy);
CREATE INDEX idx_trades_created_at ON trades(created_at);

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_trades_updated_at BEFORE UPDATE ON trades
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_trade_journal_updated_at BEFORE UPDATE ON trade_journal
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
