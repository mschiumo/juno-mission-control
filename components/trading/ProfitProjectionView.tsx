'use client';

import { useState, useMemo } from 'react';
import { TrendingUp, TrendingDown, Target, BarChart2, DollarSign } from 'lucide-react';

interface ProjectionParams {
  tradesPerDay: number;
  riskPerTrade: number;
  rewardToRisk: number;
  winRate: number;
}

interface ProjectionResult {
  winningTrades: number;
  losingTrades: number;
  profitPerWin: number;
  lossPerLoss: number;
  netPerDay: number;
  netPerWeek: number;
  netPerMonth: number;
  netPerYear: number;
  sharpeRatio: number;
}

function calculateProjection(params: ProjectionParams): ProjectionResult {
  const { riskPerTrade, tradesPerDay, rewardToRisk, winRate } = params;

  const winningTrades = tradesPerDay * winRate;
  const losingTrades = tradesPerDay * (1 - winRate);

  const profitPerWin = riskPerTrade * rewardToRisk;
  const lossPerLoss = riskPerTrade;

  const totalProfit = winningTrades * profitPerWin;
  const totalLoss = losingTrades * lossPerLoss;

  const netPerDay = totalProfit - totalLoss;
  const netPerWeek = netPerDay * 5;
  const netPerMonth = netPerDay * 21;
  const netPerYear = netPerDay * 252;

  const sharpeRatio = lossPerLoss > 0 ? profitPerWin / lossPerLoss : 0;

  return {
    winningTrades,
    losingTrades,
    profitPerWin,
    lossPerLoss,
    netPerDay,
    netPerWeek,
    netPerMonth,
    netPerYear,
    sharpeRatio,
  };
}

function fmt(n: number) {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function ProfitProjectionView() {
  const [inputs, setInputs] = useState({
    tradesPerDay: '15',
    riskPerTrade: '10',
    rewardToRisk: '2.0',
    winRate: '50',
  });

  const params: ProjectionParams = useMemo(() => ({
    tradesPerDay: parseFloat(inputs.tradesPerDay) || 0,
    riskPerTrade: parseFloat(inputs.riskPerTrade) || 0,
    rewardToRisk: parseFloat(inputs.rewardToRisk) || 0,
    winRate: (parseFloat(inputs.winRate) || 0) / 100,
  }), [inputs]);

  const projection = useMemo(() => calculateProjection(params), [params]);

  const isValid = params.tradesPerDay > 0 && params.riskPerTrade > 0 && params.rewardToRisk > 0 && params.winRate > 0;
  const winPct = Math.min(100, Math.max(0, params.winRate * 100));
  const isPositive = projection.netPerDay >= 0;

  const inputClass = "w-full bg-[#0d1117] border border-[#30363d] rounded-lg px-3 py-2 text-sm font-semibold text-white placeholder-[#8b949e] focus:outline-none focus:border-[#F97316] transition-colors";

  return (
    <div className="bg-[#161b22] border border-[#30363d] rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-6 py-4 border-b border-[#30363d] bg-[#0d1117]/50">
        <div className="p-2 bg-[#F97316]/10 rounded-lg">
          <BarChart2 className="w-5 h-5 text-[#F97316]" />
        </div>
        <div>
          <h2 className="text-base font-semibold text-white">Profit Projection</h2>
          <p className="text-[11px] text-[#8b949e]">Simulate your trading edge over time</p>
        </div>
      </div>

      <div className="p-6 space-y-6">

        {/* Input row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="space-y-1.5">
            <label className="text-[10px] font-medium text-[#8b949e] uppercase tracking-wider">Trades / Day</label>
            <input
              type="text" inputMode="decimal"
              value={inputs.tradesPerDay}
              onChange={e => setInputs(p => ({ ...p, tradesPerDay: e.target.value }))}
              placeholder="15"
              className={inputClass}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] font-medium text-[#8b949e] uppercase tracking-wider">Risk / Trade ($)</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-[#8b949e]">$</span>
              <input
                type="text" inputMode="decimal"
                value={inputs.riskPerTrade}
                onChange={e => setInputs(p => ({ ...p, riskPerTrade: e.target.value }))}
                placeholder="10"
                className={`${inputClass} pl-6`}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] font-medium text-[#8b949e] uppercase tracking-wider">Reward : Risk</label>
            <div className="relative">
              <input
                type="text" inputMode="decimal"
                value={inputs.rewardToRisk}
                onChange={e => setInputs(p => ({ ...p, rewardToRisk: e.target.value }))}
                placeholder="2.0"
                className={`${inputClass} pr-6`}
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[#8b949e]">:1</span>
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] font-medium text-[#8b949e] uppercase tracking-wider">Win Rate (%)</label>
            <div className="relative">
              <input
                type="text" inputMode="decimal"
                value={inputs.winRate}
                onChange={e => setInputs(p => ({ ...p, winRate: e.target.value }))}
                placeholder="50"
                className={`${inputClass} pr-6`}
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[#8b949e]">%</span>
            </div>
          </div>
        </div>

        {/* Win / Loss visual bar */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-[#8b949e]">
            <div className="flex items-center gap-1.5">
              <TrendingUp className="w-3.5 h-3.5 text-[#3fb950]" />
              <span>
                <span className="text-white font-medium">{isValid ? projection.winningTrades.toFixed(1) : '—'}</span> wins/day
                {isValid && <span className="ml-1 text-[#3fb950]">(+{fmt(projection.profitPerWin)} each)</span>}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <span>
                {isValid && <span className="mr-1 text-[#f85149]">(−{fmt(projection.lossPerLoss)} each)</span>}
                <span className="text-white font-medium">{isValid ? projection.losingTrades.toFixed(1) : '—'}</span> losses/day
              </span>
              <TrendingDown className="w-3.5 h-3.5 text-[#f85149]" />
            </div>
          </div>
          <div className="h-2 rounded-full overflow-hidden bg-[#f85149]/30 flex">
            <div
              className="h-full bg-[#3fb950] rounded-full transition-all duration-500"
              style={{ width: `${winPct}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-[10px] text-[#8b949e]">
            <span>{winPct.toFixed(0)}% win rate</span>
            {isValid && (
              <span className={`font-medium ${projection.sharpeRatio >= 1 ? 'text-[#3fb950]' : 'text-[#8b949e]'}`}>
                Sharpe {projection.sharpeRatio.toFixed(2)}
              </span>
            )}
          </div>
        </div>

        {/* Time-period projection cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'Per Day', value: isValid ? projection.netPerDay : null, sub: '1 trading day' },
            { label: 'Per Week', value: isValid ? projection.netPerWeek : null, sub: '5 trading days' },
            { label: 'Per Month', value: isValid ? projection.netPerMonth : null, sub: '21 trading days' },
            { label: 'Per Year', value: isValid ? projection.netPerYear : null, sub: '252 trading days', highlight: true },
          ].map(({ label, value, sub, highlight }) => {
            const positive = value !== null && value >= 0;
            return (
              <div
                key={label}
                className={`rounded-xl p-4 border ${
                  highlight
                    ? 'bg-gradient-to-br from-[#F97316]/10 to-[#d97706]/5 border-[#F97316]/30'
                    : 'bg-[#0d1117] border-[#30363d]'
                }`}
              >
                <p className={`text-[10px] font-medium uppercase tracking-wider mb-2 ${highlight ? 'text-[#F97316]' : 'text-[#8b949e]'}`}>{label}</p>
                <p className={`font-bold tabular-nums ${highlight ? 'text-2xl' : 'text-lg'} ${
                  value === null ? 'text-[#8b949e]' : positive ? 'text-[#3fb950]' : 'text-[#f85149]'
                }`}>
                  {value === null ? '—' : fmt(value)}
                </p>
                <p className="text-[10px] text-[#8b949e] mt-1">{sub}</p>
              </div>
            );
          })}
        </div>

        {/* Edge summary strip */}
        {isValid && (
          <div className={`rounded-xl border p-4 ${isPositive ? 'bg-[#3fb950]/5 border-[#3fb950]/20' : 'bg-[#f85149]/5 border-[#f85149]/20'}`}>
            <div className="grid grid-cols-3 divide-x divide-[#30363d] text-center">
              <div className="px-4">
                <p className="text-[10px] text-[#8b949e] uppercase tracking-wide mb-1">Daily Net</p>
                <p className={`text-base font-bold ${isPositive ? 'text-[#3fb950]' : 'text-[#f85149]'}`}>
                  {fmt(projection.netPerDay)}
                </p>
              </div>
              <div className="px-4">
                <p className="text-[10px] text-[#8b949e] uppercase tracking-wide mb-1">Edge per Trade</p>
                <p className={`text-base font-bold ${isPositive ? 'text-[#3fb950]' : 'text-[#f85149]'}`}>
                  {fmt(projection.netPerDay / (params.tradesPerDay || 1))}
                </p>
              </div>
              <div className="px-4">
                <p className="text-[10px] text-[#8b949e] uppercase tracking-wide mb-1">Strategy</p>
                <p className="text-base font-bold text-white flex items-center justify-center gap-1">
                  <Target className="w-3.5 h-3.5 text-[#F97316]" />
                  {params.rewardToRisk.toFixed(1)}:1 @ {(params.winRate * 100).toFixed(0)}%
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Hero yearly call-out */}
        {isValid && (
          <div className="flex items-center justify-between bg-gradient-to-r from-[#F97316]/15 to-transparent border border-[#F97316]/25 rounded-xl px-5 py-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-[#F97316]/10 rounded-lg">
                <DollarSign className="w-5 h-5 text-[#F97316]" />
              </div>
              <div>
                <p className="text-xs text-[#8b949e]">Projected annual income</p>
                <p className="text-[11px] text-[#8b949e]">{inputs.tradesPerDay} trades/day · {inputs.winRate}% win rate · {inputs.rewardToRisk}:1 R:R · ${inputs.riskPerTrade} risk</p>
              </div>
            </div>
            <p className={`text-3xl font-bold tabular-nums ${projection.netPerYear >= 0 ? 'text-[#3fb950]' : 'text-[#f85149]'}`}>
              {fmt(projection.netPerYear)}
            </p>
          </div>
        )}

      </div>
    </div>
  );
}
