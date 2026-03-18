'use client';

import { useState, useEffect } from 'react';
import { ArrowUpDown, TrendingUp, TrendingDown, Filter, Download, RefreshCw, Trash2, X, CheckSquare, Square, ChevronDown, ChevronRight } from 'lucide-react';

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

interface DateGroup {
  date: string;
  label: string;
  trades: Trade[];
  totalPnL: number;
  closedCount: number;
}

export default function TradesListView() {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [sortField, setSortField] = useState<SortField>('date');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [filterSymbol, setFilterSymbol] = useState('');
  const [filterSide, setFilterSide] = useState<'' | 'LONG' | 'SHORT'>('');
  const [collapsedDates, setCollapsedDates] = useState<Set<string>>(new Set());

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

  // Build date groups
  const groupMap = new Map<string, Trade[]>();
  for (const trade of sortedTrades) {
    const dateKey = trade.entryDate?.split('T')[0] ?? 'unknown';
    if (!groupMap.has(dateKey)) groupMap.set(dateKey, []);
    groupMap.get(dateKey)!.push(trade);
  }
  const dateKeys = Array.from(groupMap.keys()).sort((a, b) =>
    sortField === 'date' && sortDirection === 'asc' ? a.localeCompare(b) : b.localeCompare(a)
  );
  const dateGroups: DateGroup[] = dateKeys.map(dateKey => {
    const group = groupMap.get(dateKey)!;
    const [year, month, day] = dateKey.split('-');
    return {
      date: dateKey,
      label: dateKey === 'unknown' ? 'Unknown Date' : `${month}/${day}/${year}`,
      trades: group,
      totalPnL: group.reduce((sum, t) => sum + (t.netPnL ?? 0), 0),
      closedCount: group.filter(t => t.status === 'CLOSED').length,
    };
  });

  const toggleDateCollapse = (date: string) => {
    setCollapsedDates(prev => {
      const next = new Set(prev);
      if (next.has(date)) next.delete(date);
      else next.add(date);
      return next;
    });
  };

  const collapseAll = () => setCollapsedDates(new Set(dateKeys));
  const expandAll = () => setCollapsedDates(new Set());

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
      setSelectedTrades(new Set());
    } else {
      setSelectedTrades(new Set(sortedTrades.map(t => t.id)));
    }
  };

  const deleteSelectedTrades = async () => {
    setIsDeleting(true);
    const idsToDelete = Array.from(selectedTrades);
    try {
      for (const tradeId of idsToDelete) {
        await fetch(`/api/trades/${tradeId}?userId=default`, { method: 'DELETE' });
      }
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

  const TableHead = () => (
    <tr className="border-b border-[#30363d] bg-[#0d1117]">
      <th className="py-3 px-2 text-center w-10">
        <button
          onClick={toggleSelectAll}
          className="text-[#8b949e] hover:text-white transition-colors"
          title={selectedTrades.size === sortedTrades.length ? 'Deselect all' : 'Select all'}
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
      <th className="text-left py-3 px-4 text-[#8b949e] font-medium cursor-pointer hover:text-white" onClick={() => handleSort('date')}>
        <div className="flex items-center gap-1">
          Time
          {sortField === 'date' && <ArrowUpDown className={`w-3 h-3 ${sortDirection === 'desc' ? 'rotate-180' : ''}`} />}
        </div>
      </th>
      <th className="text-left py-3 px-4 text-[#8b949e] font-medium cursor-pointer hover:text-white" onClick={() => handleSort('symbol')}>
        <div className="flex items-center gap-1">
          Symbol
          {sortField === 'symbol' && <ArrowUpDown className={`w-3 h-3 ${sortDirection === 'desc' ? 'rotate-180' : ''}`} />}
        </div>
      </th>
      <th className="text-left py-3 px-4 text-[#8b949e] font-medium cursor-pointer hover:text-white" onClick={() => handleSort('side')}>
        <div className="flex items-center gap-1">
          Side
          {sortField === 'side' && <ArrowUpDown className={`w-3 h-3 ${sortDirection === 'desc' ? 'rotate-180' : ''}`} />}
        </div>
      </th>
      <th className="text-right py-3 px-4 text-[#8b949e] font-medium cursor-pointer hover:text-white" onClick={() => handleSort('shares')}>
        <div className="flex items-center justify-end gap-1">
          Shares
          {sortField === 'shares' && <ArrowUpDown className={`w-3 h-3 ${sortDirection === 'desc' ? 'rotate-180' : ''}`} />}
        </div>
      </th>
      <th className="text-right py-3 px-4 text-[#8b949e] font-medium cursor-pointer hover:text-white" onClick={() => handleSort('entryPrice')}>
        <div className="flex items-center justify-end gap-1">
          Entry
          {sortField === 'entryPrice' && <ArrowUpDown className={`w-3 h-3 ${sortDirection === 'desc' ? 'rotate-180' : ''}`} />}
        </div>
      </th>
      <th className="text-right py-3 px-4 text-[#8b949e] font-medium">PnL</th>
      <th className="text-left py-3 px-4 text-[#8b949e] font-medium">Status</th>
    </tr>
  );

  return (
    <div className="bg-[#161b22] border border-[#30363d] rounded-xl overflow-hidden">
      {/* Toolbar */}
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
          <button
            onClick={expandAll}
            className="px-2 py-1 text-xs text-[#8b949e] hover:text-white bg-[#30363d] hover:bg-[#3d444d] rounded transition-colors"
          >
            Expand all
          </button>
          <button
            onClick={collapseAll}
            className="px-2 py-1 text-xs text-[#8b949e] hover:text-white bg-[#30363d] hover:bg-[#3d444d] rounded transition-colors"
          >
            Collapse all
          </button>
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

      {/* Date groups */}
      <div className="overflow-x-auto">
        {dateGroups.map((group) => {
          const isCollapsed = collapsedDates.has(group.date);
          const groupSelected = group.trades.filter(t => selectedTrades.has(t.id)).length;

          return (
            <div key={group.date} className="border-b border-[#30363d] last:border-b-0">
              {/* Date group header */}
              <button
                onClick={() => toggleDateCollapse(group.date)}
                className="w-full flex items-center justify-between px-4 py-2.5 bg-[#0d1117] hover:bg-[#161b22] transition-colors text-left group"
              >
                <div className="flex items-center gap-3">
                  {isCollapsed
                    ? <ChevronRight className="w-4 h-4 text-[#8b949e] group-hover:text-white transition-colors flex-shrink-0" />
                    : <ChevronDown className="w-4 h-4 text-[#8b949e] group-hover:text-white transition-colors flex-shrink-0" />
                  }
                  <span className="font-semibold text-white text-sm">{group.label}</span>
                  <span className="text-xs text-[#8b949e] bg-[#30363d] px-2 py-0.5 rounded-full">
                    {group.trades.length} trade{group.trades.length !== 1 ? 's' : ''}
                  </span>
                  {group.closedCount > 0 && (
                    <span className="text-xs text-[#8b949e]">{group.closedCount} closed</span>
                  )}
                  {groupSelected > 0 && (
                    <span className="text-xs text-[#F97316]">{groupSelected} selected</span>
                  )}
                </div>
                {group.totalPnL !== 0 && (
                  <span className={`text-sm font-semibold ${group.totalPnL >= 0 ? 'text-[#3fb950]' : 'text-[#f85149]'}`}>
                    {group.totalPnL >= 0 ? '+' : ''}${group.totalPnL.toFixed(2)}
                  </span>
                )}
              </button>

              {/* Collapsible trade table */}
              {!isCollapsed && (
                <table className="w-full text-sm">
                  <thead><TableHead /></thead>
                  <tbody>
                    {group.trades.map((trade) => (
                      <tr
                        key={trade.id}
                        className={`border-b border-[#21262d] hover:bg-[#21262d]/50 ${selectedTrades.has(trade.id) ? 'bg-[#F97316]/10' : ''}`}
                      >
                        <td className="py-3 px-2 text-center">
                          <button
                            onClick={() => toggleSelection(trade.id)}
                            className="text-[#8b949e] hover:text-[#F97316] transition-colors"
                          >
                            {selectedTrades.has(trade.id)
                              ? <CheckSquare className="w-5 h-5 text-[#F97316]" />
                              : <Square className="w-5 h-5" />
                            }
                          </button>
                        </td>
                        <td className="py-3 px-4 text-white">
                          {trade.entryDate?.split('T')[1]?.substring(0, 5) ?? '—'}
                        </td>
                        <td className="py-3 px-4 font-medium text-white">{trade.symbol}</td>
                        <td className="py-3 px-4">
                          <span className={`flex items-center gap-1 ${trade.side === 'LONG' ? 'text-[#3fb950]' : 'text-[#f85149]'}`}>
                            {trade.side === 'LONG'
                              ? <><TrendingUp className="w-3 h-3" />LONG</>
                              : <><TrendingDown className="w-3 h-3" />SHORT</>
                            }
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right text-white">{trade.shares}</td>
                        <td className="py-3 px-4 text-right text-white">${trade.entryPrice?.toFixed(2)}</td>
                        <td className={`py-3 px-4 text-right ${trade.netPnL && trade.netPnL >= 0 ? 'text-[#3fb950]' : trade.netPnL && trade.netPnL < 0 ? 'text-[#f85149]' : 'text-[#8b949e]'}`}>
                          {trade.netPnL ? `${trade.netPnL >= 0 ? '+' : ''}$${trade.netPnL.toFixed(2)}` : '—'}
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
              )}
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div className="p-4 border-t border-[#30363d] text-sm text-[#8b949e] flex items-center justify-between">
        <span>
          {sortedTrades.length} of {trades.length} trades &middot; {dateGroups.length} date{dateGroups.length !== 1 ? 's' : ''}
        </span>
        {selectedTrades.size > 0 && (
          <span className="text-[#F97316]">{selectedTrades.size} selected</span>
        )}
      </div>

      {/* Delete modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[#161b22] border border-[#30363d] rounded-xl w-full max-w-md p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white">Delete Trades</h3>
              <button onClick={() => setShowDeleteModal(false)} className="p-2 hover:bg-[#30363d] rounded-lg transition-colors">
                <X className="w-5 h-5 text-[#8b949e]" />
              </button>
            </div>
            <div className="mb-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-3 bg-[#da3633]/20 rounded-full">
                  <Trash2 className="w-6 h-6 text-[#f85149]" />
                </div>
                <div>
                  <p className="text-white font-medium">Delete {selectedTrades.size} trade{selectedTrades.size !== 1 ? 's' : ''}?</p>
                  <p className="text-sm text-[#8b949e]">This action cannot be undone.</p>
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
                {isDeleting
                  ? <><RefreshCw className="w-4 h-4 animate-spin" />Deleting...</>
                  : <><Trash2 className="w-4 h-4" />Delete</>
                }
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
