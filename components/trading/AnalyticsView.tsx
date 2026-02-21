'use client';

import { useState, useEffect } from 'react';
import { TrendingUp, TrendingDown, Calendar, Clock, DollarSign, Percent, BarChart3 } from 'lucide-react';

interface AnalyticsData {
  overview: {
    totalTrades: number;
    closedTrades: number;
    uniqueDays: number;
    totalPnL: number;
    winRate: number;
    wins: number;
    losses: number;
    breakeven: number;
    avgTradesPerDay: number;
    avgPnLPerTrade: number;
  };
  bySymbol: Array<{
    symbol: string;
    trades: number;
    wins: number;
    losses: number;
    pnl: number;
    longs: number;
    shorts: number;
  }>;
  byDayOfWeek: Record<string, { trades: number; pnl: number; wins: number; losses: number }>;
  byHour: Record<string, { trades: number; pnl: number; wins: number; losses: number }>;
  byStrategy: Record<string, { trades: number; pnl: number; wins: number; losses: number }>;
}

export default function AnalyticsView() {
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchAnalytics();
  }, []);

  const fetchAnalytics = async () => {
    try {
      setIsLoading(true);
      const response = await fetch('/api/trades/analytics');
      const data = await response.json();
      
      if (data.success && data.analytics) {
        setAnalytics(data.analytics);
      }
    } catch (error) {
      console.error('Error fetching analytics:', error);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="p-8 bg-[#161b22] border border-[#30363d] rounded-xl text-center">
        <div className="w-8 h-8 border-2 border-[#F97316]/30 border-t-[#F97316] rounded-full animate-spin mx-auto mb-4" />
        <p className="text-[#8b949e]">Loading analytics...</p>
      </div>
    );
  }

  if (!analytics) {
    return (
      <div className="p-8 bg-[#161b22] border border-[#30363d] rounded-xl text-center">
        <BarChart3 className="w-12 h-12 text-[#8b949e] mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-white mb-2">No Data Yet</h3>
        <p className="text-[#8b949e]">Import your trades to see analytics.</p>
      </div>
    );
  }

  const { overview, bySymbol, byDayOfWeek, byHour } = analytics;

  return (
    <div className="space-y-6">
      {/* Overview Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard 
          title="Total PnL" 
          value={`${overview.totalPnL >= 0 ? '+' : ''}$${overview.totalPnL.toFixed(2)}`}
          icon={DollarSign}
          color={overview.totalPnL >= 0 ? 'green' : 'red'}
        />
        <StatCard 
          title="Win Rate" 
          value={`${overview.winRate.toFixed(1)}%`}
          icon={Percent}
          color={overview.winRate >= 50 ? 'green' : 'yellow'}
        />
        <StatCard 
          title="Total Trades" 
          value={overview.totalTrades.toString()}
          icon={BarChart3}
          color="blue"
        />
        <StatCard 
          title="W/L" 
          value={`${overview.wins}W / ${overview.losses}L`}
          icon={overview.wins > overview.losses ? TrendingUp : TrendingDown}
          color={overview.wins > overview.losses ? 'green' : 'red'}
        />
      </div>

      {/* By Symbol */}
      <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-6">
        <h3 className="text-lg font-semibold text-white mb-4">Performance by Symbol</h3>
        
        <div className="space-y-3">
          {bySymbol.map(({ symbol, trades, wins, losses, pnl }) => (
            <div key={symbol} className="flex items-center justify-between p-3 bg-[#0d1117] rounded-lg">
              <div className="flex items-center gap-4">
                <span className="font-semibold text-white w-16">{symbol}</span>
                <span className="text-sm text-[#8b949e]">{trades} trades</span>
                <span className="text-sm">
                  <span className="text-[#3fb950]">{wins}W</span>
                  <span className="text-[#8b949e]"> / </span>
                  <span className="text-[#f85149]">{losses}L</span>
                </span>
              </div>
              <span className={`font-semibold ${pnl >= 0 ? 'text-[#3fb950]' : 'text-[#f85149]'}`}>
                {pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* By Day of Week */}
      <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-6">
        <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <Calendar className="w-5 h-5" />
          Performance by Day of Week
        </h3>
        
        <div className="grid grid-cols-7 gap-2">
          {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map(day => {
            const data = byDayOfWeek[day];
            const hasTrades = data.trades > 0;
            
            return (
              <div key={day} className={`p-3 rounded-lg text-center ${hasTrades ? 'bg-[#0d1117]' : 'bg-[#161b22]/50'}`}>
                <div className="text-xs text-[#8b949e] mb-1">{day.slice(0, 3)}</div>
                {hasTrades ? (
                  <>
                    <div className="text-lg font-semibold text-white">{data.trades}</div>
                    <div className={`text-xs ${data.pnl >= 0 ? 'text-[#3fb950]' : 'text-[#f85149]'}`}>
                      {data.pnl >= 0 ? '+' : ''}${data.pnl.toFixed(0)}
                    </div>
                  </>
                ) : (
                  <div className="text-lg text-[#30363d]">-</div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* By Hour */}
      <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-6">
        <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <Clock className="w-5 h-5" />
          Performance by Time of Day
        </h3>
        
        <div className="space-y-2">
          {Object.entries(byHour)
            .sort((a, b) => parseInt(a[0]) - parseInt(b[0]))
            .map(([hour, data]) => {
              const hourNum = parseInt(hour);
              const ampm = hourNum >= 12 ? 'PM' : 'AM';
              const displayHour = hourNum % 12 || 12;
              const timeLabel = `${displayHour} ${ampm}`;
              
              return (
                <div key={hour} className="flex items-center gap-4">
                  <span className="text-sm text-[#8b949e] w-16">{timeLabel}</span>
                  <div className="flex-1 h-6 bg-[#0d1117] rounded-full overflow-hidden">
                    <div 
                      className={`h-full ${data.pnl >= 0 ? 'bg-[#238636]' : 'bg-[#da3633]'}`}
                      style={{ 
                        width: `${Math.min(Math.abs(data.pnl) / 50 * 100, 100)}%`,
                        opacity: data.trades > 0 ? 1 : 0
                      }}
                    />
                  </div>
                  <span className={`text-sm font-medium w-20 text-right ${data.pnl >= 0 ? 'text-[#3fb950]' : 'text-[#f85149]'}`}>
                    {data.pnl >= 0 ? '+' : ''}${data.pnl.toFixed(0)}
                  </span>
                  <span className="text-xs text-[#8b949e] w-12 text-right">{data.trades} trades</span>
                </div>
              );
            })}
        </div>
      </div>
    </div>
  );
}

function StatCard({ 
  title, 
  value, 
  icon: Icon, 
  color 
}: { 
  title: string; 
  value: string; 
  icon: React.ComponentType<{ className?: string }>; 
  color: 'green' | 'red' | 'yellow' | 'blue';
}) {
  const colorClasses = {
    green: 'text-[#3fb950]',
    red: 'text-[#f85149]',
    yellow: 'text-[#d29922]',
    blue: 'text-[#58a6ff]'
  };
  
  return (
    <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm text-[#8b949e]">{title}</span>
        <Icon className={`w-5 h-5 ${colorClasses[color]}`} />
      </div>
      <div className="text-2xl font-bold text-white">{value}</div>
    </div>
  );
}
