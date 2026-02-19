'use client';

import { useState, useEffect } from 'react';
import { ArrowUpDown, TrendingUp, TrendingDown, Filter, Download } from 'lucide-react';

interface Trade {
  id: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  quantity: number;
  price: number;
  date: string;
  time: string;
  execTime: string;
  posEffect?: string;
  orderType?: string;
}

type SortField = 'date' | 'symbol' | 'side' | 'price' | 'quantity';
type SortDirection = 'asc' | 'desc';

export default function TradesListView() {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [sortField, setSortField] = useState<SortField>('date');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [filterSymbol, setFilterSymbol] = useState('');
  const [filterSide, setFilterSide] = useState<'' | 'BUY' | 'SELL'>('');

  useEffect(() => {
    fetchTrades();
  }, []);

  const fetchTrades = async () => {
    try {
      setIsLoading(true);
      const response = await fetch('/api/trades');
      const data = await response.json();
      
      if (data.success) {
        // Flatten trades from all days
        const allTrades: Trade[] = [];
        if (data.dailyStats) {
          // Fetch all trades separately since /api/trades returns dailyStats
          const tradesResponse = await fetch('/api/trades?all=true');
          const tradesData = await tradesResponse.json();
          if (tradesData.trades) {
            allTrades.push(...tradesData.trades);
          }
        }
        setTrades(allTrades);
      }
    } catch (error) {
      console.error('Error fetching trades:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const filteredTrades = trades.filter(trade => {
    const matchesSymbol = !filterSymbol || trade.symbol.toLowerCase().includes(filterSymbol.toLowerCase());
    const matchesSide = !filterSide || trade.side === filterSide;
    return matchesSymbol && matchesSide;
  });

  const sortedTrades = [...filteredTrades].sort((a, b) => {
    let comparison = 0;
    switch (sortField) {
      case 'date':
        comparison = new Date(a.date + ' ' + a.time).getTime() - new Date(b.date + ' ' + b.time).getTime();
        break;
      case 'symbol':
        comparison = a.symbol.localeCompare(b.symbol);
        break;
      case 'side':
        comparison = a.side.localeCompare(b.side);
        break;
      case 'price':
        comparison = a.price - b.price;
        break;
      case 'quantity':
        comparison = a.quantity - b.quantity;
        break;
    }
    return sortDirection === 'asc' ? comparison : -comparison;
  });

  const exportToCSV = () => {
    const headers = ['Date', 'Time', 'Symbol', 'Side', 'Quantity', 'Price', 'Order Type'];
    const rows = sortedTrades.map(t => [
      t.date,
      t.time,
      t.symbol,
      t.side,
      t.quantity,
      t.price.toFixed(2),
      t.orderType || ''
    ]);
    
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `trades_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  if (isLoading) {
    return (
      <div className="p-8 bg-[#161b22] border border-[#30363d] rounded-xl text-center">
        <div className="w-8 h-8 border-2 border-[#F97316]/30 border-t-[#F97316] rounded-full animate-spin mx-auto mb-4" />
        <p className="text-[#8b949e]">Loading trades...</p>
      </div>
    );
  }

  if (trades.length === 0) {
    return (
      <div className="p-8 bg-[#161b22] border border-[#30363d] rounded-xl text-center">
        <TrendingUp className="w-12 h-12 text-[#8b949e] mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-white mb-2">No Trades Yet</h3>
        <p className="text-[#8b949e] mb-4">Import your trades from ThinkOrSwim to see them here.</p>
      </div>
    );
  }

  return (
    <div className="bg-[#161b22] border border-[#30363d] rounded-xl overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-[#30363d] flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-[#8b949e]" />
            <input
              type="text"
              placeholder="Filter by symbol..."
              value={filterSymbol}
              onChange={(e) => setFilterSymbol(e.target.value)}
              className="px-3 py-1.5 bg-[#0d1117] border border-[#30363d] rounded-lg text-white text-sm focus:outline-none focus:border-[#F97316]"
            />
          </div>
          
          <select
            value={filterSide}
            onChange={(e) => setFilterSide(e.target.value as '' | 'BUY' | 'SELL')}
            className="px-3 py-1.5 bg-[#0d1117] border border-[#30363d] rounded-lg text-white text-sm focus:outline-none focus:border-[#F97316]"
          >
            <option value="">All Sides</option>
            <option value="BUY">Buy</option>
            <option value="SELL">Sell</option>
          </select>
        </div>
        
        <button
          onClick={exportToCSV}
          className="flex items-center gap-2 px-3 py-1.5 bg-[#238636] hover:bg-[#2ea043] text-white rounded-lg text-sm transition-colors"
        >
          <Download className="w-4 h-4" />
          Export CSV
        </button>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#30363d] bg-[#0d1117]">
              <th 
                className="text-left py-3 px-4 text-[#8b949e] font-medium cursor-pointer hover:text-white"
                onClick={() => handleSort('date')}
              >
                <div className="flex items-center gap-1">
                  Date/Time
                  {sortField === 'date' && (
                    <ArrowUpDown className={`w-3 h-3 ${sortDirection === 'desc' ? 'rotate-180' : ''}`} />
                  )}
                </div>
              </th>
              <th 
                className="text-left py-3 px-4 text-[#8b949e] font-medium cursor-pointer hover:text-white"
                onClick={() => handleSort('symbol')}
              >
                <div className="flex items-center gap-1">
                  Symbol
                  {sortField === 'symbol' && (
                    <ArrowUpDown className={`w-3 h-3 ${sortDirection === 'desc' ? 'rotate-180' : ''}`} />
                  )}
                </div>
              </th>
              <th 
                className="text-left py-3 px-4 text-[#8b949e] font-medium cursor-pointer hover:text-white"
                onClick={() => handleSort('side')}
              >
                <div className="flex items-center gap-1">
                  Side
                  {sortField === 'side' && (
                    <ArrowUpDown className={`w-3 h-3 ${sortDirection === 'desc' ? 'rotate-180' : ''}`} />
                  )}
                </div>
              </th>
              <th 
                className="text-right py-3 px-4 text-[#8b949e] font-medium cursor-pointer hover:text-white"
                onClick={() => handleSort('quantity')}
              >
                <div className="flex items-center justify-end gap-1">
                  Qty
                  {sortField === 'quantity' && (
                    <ArrowUpDown className={`w-3 h-3 ${sortDirection === 'desc' ? 'rotate-180' : ''}`} />
                  )}
                </div>
              </th>
              <th 
                className="text-right py-3 px-4 text-[#8b949e] font-medium cursor-pointer hover:text-white"
                onClick={() => handleSort('price')}
              >
                <div className="flex items-center justify-end gap-1">
                  Price
                  {sortField === 'price' && (
                    <ArrowUpDown className={`w-3 h-3 ${sortDirection === 'desc' ? 'rotate-180' : ''}`} />
                  )}
                </div>
              </th>
              <th className="text-left py-3 px-4 text-[#8b949e] font-medium">Type</th>
            </tr>
          </thead>
          <tbody>
            {sortedTrades.map((trade) => (
              <tr key={trade.id} className="border-b border-[#21262d] hover:bg-[#21262d]/50">
                <td className="py-3 px-4 text-white">
                  <div className="text-xs text-[#8b949e]">{trade.date}</div>
                  <div>{trade.time}</div>
                </td>
                <td className="py-3 px-4 font-medium text-white">{trade.symbol}</td>
                <td className="py-3 px-4">
                  <span className={`flex items-center gap-1 ${trade.side === 'BUY' ? 'text-[#3fb950]' : 'text-[#f85149]'}`}>
                    {trade.side === 'BUY' ? (
                      <>
                        <TrendingUp className="w-3 h-3" />
                        BUY
                      </>
                    ) : (
                      <>
                        <TrendingDown className="w-3 h-3" />
                        SELL
                      </>
                    )}
                  </span>
                </td>
                <td className="py-3 px-4 text-right text-white">{trade.quantity}</td>
                <td className="py-3 px-4 text-right text-white">${trade.price.toFixed(2)}</td>
                <td className="py-3 px-4 text-[#8b949e]">{trade.orderType || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      
      {/* Footer */}
      <div className="p-4 border-t border-[#30363d] text-sm text-[#8b949e]">
        Showing {sortedTrades.length} of {trades.length} trades
      </div>
    </div>
  );
}
