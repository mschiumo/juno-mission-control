'use client';

import { useState, useMemo } from 'react';
import { Calculator, TrendingUp, DollarSign, Target, Percent, Calendar, Info } from 'lucide-react';

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

export default function ProfitProjectionView() {
  const [params, setParams] = useState<ProjectionParams>({
    tradesPerDay: 15,
    riskPerTrade: 10,
    rewardToRisk: 2.0,
    winRate: 0.5,
  });

  const projection = useMemo(() => calculateProjection(params), [params]);

  // Calculate for $10, $50, $100 scenarios
  const scenarios = useMemo(() => {
    return [10, 50, 100].map(risk => ({
      risk,
      ...calculateProjection({ ...params, riskPerTrade: risk })
    }));
  }, [params]);

  const updateParam = (field: keyof ProjectionParams, value: number) => {
    setParams(prev => ({ ...prev, [field]: value }));
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Calculator className="w-6 h-6 text-[#F97316]" />
          <h2 className="text-xl font-bold text-white">Profit Projection</h2>
        </div>
      </div>

      {/* Main Inputs - Like Excel Top Section */}
      <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-6">
        <h3 className="text-sm font-medium text-[#8b949e] mb-4 flex items-center gap-2">
          <Target className="w-4 h-4" />
          Trading Parameters
        </h3>
        
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-[#fef08a]/10 border border-[#fef08a]/30 rounded-lg p-4">
            <label className="block text-xs text-[#fef08a] font-medium mb-1.5 uppercase tracking-wide">
              Trades/Day
            </label>
            <input
              type="number"
              value={params.tradesPerDay}
              onChange={(e) => updateParam('tradesPerDay', parseInt(e.target.value) || 0)}
              min={1}
              max={100}
              className="w-full px-3 py-2 bg-[#0d1117] border border-[#fef08a]/30 rounded-lg text-white text-lg font-semibold focus:outline-none focus:border-[#F97316]"
            />
          </div>

          <div className="bg-[#fef08a]/10 border border-[#fef08a]/30 rounded-lg p-4">
            <label className="block text-xs text-[#fef08a] font-medium mb-1.5 uppercase tracking-wide">
              Risk/Trade ($)
            </label>
            <input
              type="number"
              value={params.riskPerTrade}
              onChange={(e) => updateParam('riskPerTrade', parseFloat(e.target.value) || 0)}
              min={1}
              step={5}
              className="w-full px-3 py-2 bg-[#0d1117] border border-[#fef08a]/30 rounded-lg text-white text-lg font-semibold focus:outline-none focus:border-[#F97316]"
            />
          </div>

          <div className="bg-[#fef08a]/10 border border-[#fef08a]/30 rounded-lg p-4">
            <label className="block text-xs text-[#fef08a] font-medium mb-1.5 uppercase tracking-wide">
              Reward to Risk
            </label>
            <input
              type="number"
              value={params.rewardToRisk}
              onChange={(e) => updateParam('rewardToRisk', parseFloat(e.target.value) || 0)}
              min={0.5}
              step={0.5}
              className="w-full px-3 py-2 bg-[#0d1117] border border-[#fef08a]/30 rounded-lg text-white text-lg font-semibold focus:outline-none focus:border-[#F97316]"
            />
          </div>

          <div className="bg-[#fef08a]/10 border border-[#fef08a]/30 rounded-lg p-4">
            <label className="block text-xs text-[#fef08a] font-medium mb-1.5 uppercase tracking-wide">
              Win Rate (%)
            </label>
            <input
              type="number"
              value={Math.round(params.winRate * 100)}
              onChange={(e) => updateParam('winRate', parseFloat(e.target.value) / 100 || 0)}
              min={0}
              max={100}
              className="w-full px-3 py-2 bg-[#0d1117] border border-[#fef08a]/30 rounded-lg text-white text-lg font-semibold focus:outline-none focus:border-[#F97316]"
            />
          </div>
        </div>
      </div>

      {/* Results Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Current Scenario Breakdown */}
        <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-6">
          <h3 className="text-sm font-medium text-[#8b949e] mb-4">
            Trade Breakdown (${params.riskPerTrade} Risk)
          </h3>
          
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-4 text-sm border-b border-[#30363d] pb-2">
              <div></div>
              <div className="text-center text-[#3fb950] font-medium">Winning Trades</div>
              <div className="text-center text-[#f85149] font-medium">Losing Trades</div>
            </div>
            
            <div className="grid grid-cols-3 gap-4 py-2 border-b border-[#21262d] text-sm">
              <span className="text-[#8b949e]">Trades per day</span>
              <span className="text-center text-white">{projection.winningTrades.toFixed(2)}</span>
              <span className="text-center text-white">{projection.losingTrades.toFixed(2)}</span>
            </div>
            
            <div className="grid grid-cols-3 gap-4 py-2 border-b border-[#21262d] text-sm">
              <span className="text-[#8b949e]">R Per trade</span>
              <span className="text-center text-white">{params.rewardToRisk.toFixed(1)}</span>
              <span className="text-center text-white">1.0</span>
            </div>
            
            <div className="grid grid-cols-3 gap-4 py-2 border-b border-[#21262d] text-sm">
              <span className="text-[#8b949e]">Risk Unit</span>
              <span className="text-center text-[#3fb950]">${(projection.winningTrades * params.riskPerTrade).toFixed(2)}</span>
              <span className="text-center text-[#f85149]">${(projection.losingTrades * params.riskPerTrade).toFixed(2)}</span>
            </div>
            
            <div className="grid grid-cols-3 gap-4 py-2 text-sm">
              <span className="text-[#8b949e]">Profit (Gain/Loss)</span>
              <span className="text-center text-[#3fb950] font-semibold">${projection.profitPerWin.toFixed(2)}</span>
              <span className="text-center text-[#f85149] font-semibold">-${projection.lossPerLoss.toFixed(2)}</span>
            </div>
          </div>

          <div className="mt-4 pt-4 border-t border-[#30363d]">
            <div className="flex items-center justify-between text-sm">
              <span className="text-[#8b949e]">Sharpe Ratio</span>
              <span className={`font-semibold ${projection.sharpeRatio >= 1 ? 'text-[#3fb950]' : 'text-[#8b949e]'}`}>
                {projection.sharpeRatio.toFixed(2)}
              </span>
            </div>
          </div>
        </div>

        {/* Income Projection */}
        <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-6">
          <h3 className="text-sm font-medium text-[#8b949e] mb-4 flex items-center gap-2">
            <TrendingUp className="w-4 h-4" />
            Income Projection (${params.riskPerTrade} Risk)
          </h3>
          
          <div className="space-y-3">
            <ProjectionRow label="Per day" value={projection.netPerDay} />
            <ProjectionRow label="Per week" value={projection.netPerWeek} />
            <ProjectionRow label="Per month" value={projection.netPerMonth} />
            <ProjectionRow label="Per year" value={projection.netPerYear} isTotal />
          </div>
        </div>
      </div>

      {/* Comparison Table - $10 vs $50 vs $100 */}
      <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-6">
        <h3 className="text-sm font-medium text-[#8b949e] mb-4 flex items-center gap-2">
          <DollarSign className="w-4 h-4" />
          Risk Comparison ($10 / $50 / $100)
        </h3>
        
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#30363d]">
                <th className="text-left py-3 text-[#8b949e] font-medium">Risk/Trade</th>
                <th className="text-right py-3 text-[#8b949e] font-medium">Per Day</th>
                <th className="text-right py-3 text-[#8b949e] font-medium">Per Week</th>
                <th className="text-right py-3 text-[#8b949e] font-medium">Per Month</th>
                <th className="text-right py-3 text-[#8b949e] font-medium">Per Year</th>
              </tr>
            </thead>
            <tbody>
              {scenarios.map((scenario) => (
                <tr 
                  key={scenario.risk} 
                  className={`border-b border-[#21262d] last:border-0 ${scenario.risk === params.riskPerTrade ? 'bg-[#F97316]/10' : ''}`}
                >
                  <td className="py-3">
                    <button
                      onClick={() => updateParam('riskPerTrade', scenario.risk)}
                      className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                        scenario.risk === params.riskPerTrade 
                          ? 'bg-[#F97316] text-white' 
                          : 'bg-[#21262d] text-[#8b949e] hover:bg-[#30363d]'
                      }`}
                    >
                      ${scenario.risk}
                    </button>
                  </td>
                  <td className={`text-right py-3 ${scenario.netPerDay >= 0 ? 'text-[#3fb950]' : 'text-[#f85149]'}`}>
                    ${scenario.netPerDay.toFixed(2)}
                  </td>
                  <td className={`text-right py-3 ${scenario.netPerWeek >= 0 ? 'text-[#3fb950]' : 'text-[#f85149]'}`}>
                    ${scenario.netPerWeek.toFixed(2)}
                  </td>
                  <td className={`text-right py-3 ${scenario.netPerMonth >= 0 ? 'text-[#3fb950]' : 'text-[#f85149]'}`}>
                    ${scenario.netPerMonth.toFixed(2)}
                  </td>
                  <td className={`text-right py-3 font-semibold ${scenario.netPerYear >= 0 ? 'text-[#3fb950]' : 'text-[#f85149]'}`}>
                    ${scenario.netPerYear.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Summary Card */}
      <div className="bg-gradient-to-r from-[#F97316]/20 to-[#d97706]/20 border border-[#F97316]/30 rounded-xl p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-[#8b949e] mb-1">Total Yearly Income (${params.riskPerTrade} Risk/Trade)</p>
            <p className="text-3xl font-bold text-white">
              ${projection.netPerYear.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
          </div>
          <div className="text-right">
            <p className="text-sm text-[#8b949e] mb-1">Based on</p>
            <p className="text-sm text-white">{params.tradesPerDay} trades/day @ {Math.round(params.winRate * 100)}% win rate</p>
            <p className="text-sm text-[#8b949e]">{params.rewardToRisk}:1 Reward/Risk</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function ProjectionRow({ 
  label, 
  value, 
  isTotal = false 
}: { 
  label: string;
  value: number;
  isTotal?: boolean;
}) {
  return (
    <div className={`flex items-center justify-between py-2 ${isTotal ? 'border-t border-[#30363d] pt-3' : 'border-b border-[#21262d] last:border-0'}`}>
      <div className="flex items-center gap-2">
        <Calendar className={`w-4 h-4 ${isTotal ? 'text-[#F97316]' : 'text-[#8b949e]'}`} />
        <span className={isTotal ? 'text-white font-medium' : 'text-[#8b949e]'}>{label}</span>
      </div>
      <span className={`font-semibold ${value >= 0 ? 'text-[#3fb950]' : 'text-[#f85149]'}`}>
        ${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      </span>
    </div>
  );
}
