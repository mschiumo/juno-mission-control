'use client';

import { useState, useEffect } from 'react';
import { ArrowUpDown, TrendingUp, TrendingDown, Filter, Download, RefreshCw, Trash2, X, CheckSquare, Square } from 'lucide-react';

interface Trade {
  id: string;
  symbol: string;
  side: 'LONG' | 'SHORT';
  shares: number;
  entryPrice: number;
  entryDate: string;
  exitPrice?: number;
  exitDate?: string;
  netPnL?: number;
  status: 'OPEN' | 'CLOSED';
  strategy?: string;
}

type SortField = 'date' | 'symbol' | 'side' | 'entryPrice' | 'shares';
type SortDirection = 'asc' | 'desc';

export default function TradesListView() {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [sortField, setSortField] = useState<SortField>('date');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [filterSymbol, setFilterSymbol] = useState('');
  const [filterSide, setFilterSide] = useState<'' | 'LONG' | 'SHORT'>('');
  
  // Selection state
  const [selectedTrades, setSelectedTrades] = useState<Set<string>>(new Set());
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    fetchTrades();
  }, []);

  const fetchTrades = async () => {
    try {
      setIsLoading(true);
      const response = await fetch('/api/trades?userId=default&perPage=100');
      const data = await response.json();
      
      if (data.success && data.data && data.data.trades) {
        setTrades(data.data.trades);
        // Clear selection when data refreshes
        setSelectedTrades(new Set());
      } else {
        setTrades([]);
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
        comparison = new Date(a.entryDate).getTime() - new Date(b.entryDate).getTime();
        break;
      case 'symbol':
        comparison = a.symbol.localeCompare(b.symbol);
        break;
      case 'side':
        comparison = a.side.localeCompare(b.side);
        break;
      case 'entryPrice':
        comparison = a.entryPrice - b.entryPrice;
        break;
      case 'shares':
        comparison = a.shares - b.shares;
        break;
    }
    return sortDirection === 'asc' ? comparison : -comparison;
  });

  // Selection handlers
  const toggleSelection = (tradeId: string) => {
    const newSelected = new Set(selectedTrades);
    if (newSelected.has(tradeId)) {
      newSelected.delete(tradeId);
    } else {
      newSelected.add(tradeId);
    }
    setSelectedTrades(newSelected);
  };

  const toggleSelectAll = () => {
    if (selectedTrades.size === sortedTrades.length) {
      // Deselect all
      setSelectedTrades(new Set());
    } else {
      // Select all
      setSelectedTrades(new Set(sortedTrades.map(t => t.id)));
    }
  };

  const deleteSelectedTrades = async () => {
    setIsDeleting(true);
    const idsToDelete = Array.from(selectedTrades);
    
    try {
      // Delete trades one by one
      for (const tradeId of idsToDelete) {
        await fetch(`/api/trades/${tradeId}?userId=default`, {
          method: 'DELETE'
        });
      }
      
      // Refresh the list
      await fetchTrades();
      setShowDeleteModal(false);
    } catch (error) {
      console.error('Error deleting trades:', error);
      alert('Failed to delete some trades');
    } finally {
      setIsDeleting(false);
    }
  };

  const exportToCSV = () => {
    const headers = ['Date', 'Symbol', 'Side', 'Shares', 'Entry Price', 'Exit Price', 'PnL', 'Status'];
    const rows = sortedTrades.map(t => [
      t.entryDate,
      t.symbol,
      t.side,
      t.shares,
      t.entryPrice.toFixed(2),
      t.exitPrice?.toFixed(2) || '',
      t.netPnL?.toFixed(2) || '',
      t.status
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
            onChange={(e) => setFilterSide(e.target.value as '' | 'LONG' | 'SHORT')}
            className="px-3 py-1.5 bg-[#0d1117] border border-[#30363d] rounded-lg text-white text-sm focus:outline-none focus:border-[#F97316]"
          >
            <option value="">All Sides</option>
            <option value="LONG">Long</option>
            <option value="SHORT">Short</option>
          </select>
          
          <button
            onClick={fetchTrades}
            disabled={isLoading}
            className="p-2 bg-[#30363d] hover:bg-[#3d444d] text-white rounded-lg transition-colors disabled:opacity-50"
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
        
        <div className="flex items-center gap-2">
          {selectedTrades.size > 0 && (
            <button
              onClick={() => setShowDeleteModal(true)}
              className="flex items-center gap-2 px-3 py-1.5 bg-[#da3633]/20 hover:bg-[#da3633]/30 text-[#f85149] rounded-lg text-sm transition-colors"
            >
              <Trash2 className="w-4 h-4" />
              Delete ({selectedTrades.size})
            </button>
          )}
          
          <button
            onClick={exportToCSV}
            className="flex items-center gap-2 px-3 py-1.5 bg-[#238636] hover:bg-[#2ea043] text-white rounded-lg text-sm transition-colors"
          >
            <Download className="w-4 h-4" />
            Export CSV
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#30363d] bg-[#0d1117]">
              <th className="py-3 px-2 text-center w-10">
                <button
                  onClick={toggleSelectAll}
                  className="text-[#8b949e] hover:text-white transition-colors"
                  title={selectedTrades.size === sortedTrades.length ? "Deselect all" : "Select all"}
                >
                  {selectedTrades.size === sortedTrades.length ? (
                    <CheckSquare className="w-5 h-5" />
                  ) : selectedTrades.size > 0 ? (
                    <div className="relative">
                      <Square className="w-5 h-5" />
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="w-2 h-2 bg-[#F97316] rounded-sm" />
                      </div>
                    </div>
                  ) : (
                    <Square className="w-5 h-5" />
                  )}
                </button>
              </th>
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
                onClick={() => handleSort('shares')}
              >
                <div className="flex items-center justify-end gap-1">
                  Shares
                  {sortField === 'shares' && (
                    <ArrowUpDown className={`w-3 h-3 ${sortDirection === 'desc' ? 'rotate-180' : ''}`} />
                  )}
                </div>
              </th>
              <th 
                className="text-right py-3 px-4 text-[#8b949e] font-medium cursor-pointer hover:text-white"
                onClick={() => handleSort('entryPrice')}
              >
                <div className="flex items-center justify-end gap-1">
                  Entry
                  {sortField === 'entryPrice' && (
                    <ArrowUpDown className={`w-3 h-3 ${sortDirection === 'desc' ? 'rotate-180' : ''}`} />
                  )}
                </div>
              </th>
              <th className="text-right py-3 px-4 text-[#8b949e] font-medium">PnL</th>
              <th className="text-left py-3 px-4 text-[#8b949e] font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {sortedTrades.map((trade) => (
              <tr 
                key={trade.id} 
                className={`border-b border-[#21262d] hover:bg-[#21262d]/50 ${selectedTrades.has(trade.id) ? 'bg-[#F97316]/10' : ''}`}
              >
                <td className="py-3 px-2 text-center">
                  <button
                    onClick={() => toggleSelection(trade.id)}
                    className="text-[#8b949e] hover:text-[#F97316] transition-colors"
                  >
                    {selectedTrades.has(trade.id) ? (
                      <CheckSquare className="w-5 h-5 text-[#F97316]" />
                    ) : (
                      <Square className="w-5 h-5" />
                    )}
                  </button>
                </td>
                <td className="py-3 px-4 text-white">
                  <div className="text-xs text-[#8b949e]">{trade.entryDate?.split('T')[0]}</div>
                  <div>{trade.entryDate?.split('T')[1]?.substring(0, 5)}</div>
                </td>
                <td className="py-3 px-4 font-medium text-white">{trade.symbol}</td>
                <td className="py-3 px-4">
                  <span className={`flex items-center gap-1 ${trade.side === 'LONG' ? 'text-[#3fb950]' : 'text-[#f85149]'}`}>
                    {trade.side === 'LONG' ? (
                      <>
                        <TrendingUp className="w-3 h-3" />
                        LONG
                      </>
                    ) : (
                      <>
                        <TrendingDown className="w-3 h-3" />
                        SHORT
                      </>
                    )}
                  </span>
                </td>
                <td className="py-3 px-4 text-right text-white">{trade.shares}</td>
                <td className="py-3 px-4 text-right text-white">${trade.entryPrice?.toFixed(2)}</td>
                <td className={`py-3 px-4 text-right ${trade.netPnL && trade.netPnL >= 0 ? 'text-[#3fb950]' : trade.netPnL && trade.netPnL < 0 ? 'text-[#f85149]' : 'text-[#8b949e]'}`}>
                  {trade.netPnL ? `${trade.netPnL >= 0 ? '+' : ''}$${trade.netPnL.toFixed(2)}` : '-'}
                </td>
                <td className="py-3 px-4">
                  <span className={`text-xs px-2 py-1 rounded-full ${trade.status === 'CLOSED' ? 'bg-[#238636]/20 text-[#3fb950]' : 'bg-[#d29922]/20 text-[#d29922]'}`}>
                    {trade.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      
      {/* Footer */}
      <div className="p-4 border-t border-[#30363d] text-sm text-[#8b949e] flex items-center justify-between">
        <span>Showing {sortedTrades.length} of {trades.length} trades</span>
        {selectedTrades.size > 0 && (
          <span className="text-[#F97316]">{selectedTrades.size} selected</span>
        )}
      </div>

      {/* Custom Delete Confirmation Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[#161b22] border border-[#30363d] rounded-xl w-full max-w-md p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white">Delete Trades</h3>
              <button
                onClick={() => setShowDeleteModal(false)}
                className="p-2 hover:bg-[#30363d] rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-[#8b949e]" />
              </button>
            </div>
            
            <div className="mb-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-3 bg-[#da3633]/20 rounded-full">
                  <Trash2 className="w-6 h-6 text-[#f85149]" />
                </div>
                <div>
                  <p className="text-white font-medium">
                    Delete {selectedTrades.size} trade{selectedTrades.size !== 1 ? 's' : ''}?
                  </p>
                  <p className="text-sm text-[#8b949e]">
                    This action cannot be undone.
                  </p>
                </div>
              </div>
            </div>
            
            <div className="flex gap-3">
              <button
                onClick={() => setShowDeleteModal(false)}
                className="flex-1 px-4 py-3 bg-[#30363d] hover:bg-[#3d444d] text-white rounded-lg transition-colors font-medium"
              >
                Cancel
              </button>
              <button
                onClick={deleteSelectedTrades}
                disabled={isDeleting}
                className="flex-1 px-4 py-3 bg-[#da3633] hover:bg-[#f85149] text-white rounded-lg transition-colors font-medium disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isDeleting ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Deleting...
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4" />
                    Delete
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
