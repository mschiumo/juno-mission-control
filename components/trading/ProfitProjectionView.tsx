'use client';

import { useState, useMemo } from 'react';
import { Calculator, TrendingUp, DollarSign, Target, Percent, Calendar } from 'lucide-react';

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
  // Use string state to allow empty/cleared inputs
  const [inputs, setInputs] = useState({
    tradesPerDay: '15',
    riskPerTrade: '10',
    rewardToRisk: '2.0',
    winRate: '50',
  });
  
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Parse and validate params for calculation
  const params: ProjectionParams = useMemo(() => {
    const tradesPerDay = parseFloat(inputs.tradesPerDay);
    const riskPerTrade = parseFloat(inputs.riskPerTrade);
    const rewardToRisk = parseFloat(inputs.rewardToRisk);
    const winRate = parseFloat(inputs.winRate) / 100;
    
    return {
      tradesPerDay: isNaN(tradesPerDay) ? 0 : tradesPerDay,
      riskPerTrade: isNaN(riskPerTrade) ? 0 : riskPerTrade,
      rewardToRisk: isNaN(rewardToRisk) ? 0 : rewardToRisk,
      winRate: isNaN(winRate) ? 0 : winRate,
    };
  }, [inputs]);

  const projection = useMemo(() => calculateProjection(params), [params]);

  const validateField = (name: string, value: string): string => {
    if (value === '' || value === undefined || value === null) {
      return 'This field is required';
    }
    const num = parseFloat(value);
    if (isNaN(num)) {
      return 'Please enter a valid number';
    }
    if (num < 0) {
      return 'Value must be positive';
    }
    return '';
  };

  const updateInput = (field: keyof typeof inputs, value: string) => {
    setInputs(prev => ({ ...prev, [field]: value }));
    
    const error = validateField(field, value);
    setErrors(prev => ({ ...prev, [field]: error }));
  };

  const hasErrors = Object.values(errors).some(e => e !== '');

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 sm:gap-3">
          <Calculator className="w-5 h-5 sm:w-6 sm:h-6 text-[#F97316]" />
          <h2 className="text-lg sm:text-xl font-bold text-white">Profit Projection</h2>
        </div>
      </div>

      {/* Main Inputs - Stacked on mobile, grid on larger screens */}
      <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-4 sm:p-6">
        <h3 className="text-xs sm:text-sm font-medium text-[#8b949e] mb-3 sm:mb-4 flex items-center gap-2">
          <Target className="w-4 h-4" />
          Trading Parameters
        </h3>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <div className="bg-[#fef08a]/10 border border-[#fef08a]/30 rounded-lg p-3 sm:p-4">
            <label className="block text-xs text-[#fef08a] font-medium mb-1.5 uppercase tracking-wide">
              Trades/Day
            </label>
            <input
              type="text"
              inputMode="decimal"
              value={inputs.tradesPerDay}
              onChange={(e) => updateInput('tradesPerDay', e.target.value)}
              placeholder="15"
              className="w-full px-3 py-2.5 sm:py-2 bg-[#0d1117] border border-[#fef08a]/30 rounded-lg text-white text-base sm:text-lg font-semibold focus:outline-none focus:border-[#F97316] min-h-[44px]"
            />
            {errors.tradesPerDay && (
              <p className="text-xs text-[#f85149] mt-1">{errors.tradesPerDay}</p>
            )}
          </div>

          <div className="bg-[#fef08a]/10 border border-[#fef08a]/30 rounded-lg p-3 sm:p-4">
            <label className="block text-xs text-[#fef08a] font-medium mb-1.5 uppercase tracking-wide">
              Risk/Trade ($)
            </label>
            <input
              type="text"
              inputMode="decimal"
              value={inputs.riskPerTrade}
              onChange={(e) => updateInput('riskPerTrade', e.target.value)}
              placeholder="10"
              className="w-full px-3 py-2.5 sm:py-2 bg-[#0d1117] border border-[#fef08a]/30 rounded-lg text-white text-base sm:text-lg font-semibold focus:outline-none focus:border-[#F97316] min-h-[44px]"
            />
            {errors.riskPerTrade && (
              <p className="text-xs text-[#f85149] mt-1">{errors.riskPerTrade}</p>
            )}
          </div>

          <div className="bg-[#fef08a]/10 border border-[#fef08a]/30 rounded-lg p-3 sm:p-4">
            <label className="block text-xs text-[#fef08a] font-medium mb-1.5 uppercase tracking-wide">
              Reward to Risk
            </label>
            <input
              type="text"
              inputMode="decimal"
              value={inputs.rewardToRisk}
              onChange={(e) => updateInput('rewardToRisk', e.target.value)}
              placeholder="2.0"
              className="w-full px-3 py-2.5 sm:py-2 bg-[#0d1117] border border-[#fef08a]/30 rounded-lg text-white text-base sm:text-lg font-semibold focus:outline-none focus:border-[#F97316] min-h-[44px]"
            />
            {errors.rewardToRisk && (
              <p className="text-xs text-[#f85149] mt-1">{errors.rewardToRisk}</p>
            )}
          </div>

          <div className="bg-[#fef08a]/10 border border-[#fef08a]/30 rounded-lg p-3 sm:p-4">
            <label className="block text-xs text-[#fef08a] font-medium mb-1.5 uppercase tracking-wide">
              Win Rate (%)
            </label>
            <input
              type="text"
              inputMode="decimal"
              value={inputs.winRate}
              onChange={(e) => updateInput('winRate', e.target.value)}
              placeholder="50"
              className="w-full px-3 py-2.5 sm:py-2 bg-[#0d1117] border border-[#fef08a]/30 rounded-lg text-white text-base sm:text-lg font-semibold focus:outline-none focus:border-[#F97316] min-h-[44px]"
            />
            {errors.winRate && (
              <p className="text-xs text-[#f85149] mt-1">{errors.winRate}</p>
            )}
          </div>
        </div>
      </div>

      {/* Results Grid - Stack on mobile */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        {/* Current Scenario Breakdown - Card layout on mobile */}
        <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-4 sm:p-6">
          <h3 className="text-xs sm:text-sm font-medium text-[#8b949e] mb-3 sm:mb-4">
            Trade Breakdown (${isNaN(parseFloat(inputs.riskPerTrade)) ? '0' : inputs.riskPerTrade} Risk)
          </h3>
          
          {/* Mobile Card Layout */}
          <div className="md:hidden space-y-3">
            {/* Winning Trades Card */}
            <div className="bg-[#238636]/10 border border-[#238636]/30 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-2 h-2 bg-[#3fb950] rounded-full"></div>
                <span className="text-sm font-medium text-[#3fb950]">Winning Trades</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <span className="text-[#8b949e] text-xs">Per Day</span>
                  <p className="text-white font-semibold">{hasErrors ? '-' : projection.winningTrades.toFixed(2)}</p>
                </div>
                <div>
                  <span className="text-[#8b949e] text-xs">R Per Trade</span>
                  <p className="text-white font-semibold">{hasErrors ? '-' : params.rewardToRisk.toFixed(1)}</p>
                </div>
                <div>
                  <span className="text-[#8b949e] text-xs">Risk Unit</span>
                  <p className="text-[#3fb950] font-semibold">{hasErrors ? '-' : '$' + (projection.winningTrades * params.riskPerTrade).toFixed(2)}</p>
                </div>
                <div>
                  <span className="text-[#8b949e] text-xs">Profit</span>
                  <p className="text-[#3fb950] font-semibold">{hasErrors ? '-' : '$' + projection.profitPerWin.toFixed(2)}</p>
                </div>
              </div>
            </div>

            {/* Losing Trades Card */}
            <div className="bg-[#da3633]/10 border border-[#da3633]/30 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-2 h-2 bg-[#f85149] rounded-full"></div>
                <span className="text-sm font-medium text-[#f85149]">Losing Trades</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <span className="text-[#8b949e] text-xs">Per Day</span>
                  <p className="text-white font-semibold">{hasErrors ? '-' : projection.losingTrades.toFixed(2)}</p>
                </div>
                <div>
                  <span className="text-[#8b949e] text-xs">R Per Trade</span>
                  <p className="text-white font-semibold">1.0</p>
                </div>
                <div>
                  <span className="text-[#8b949e] text-xs">Risk Unit</span>
                  <p className="text-[#f85149] font-semibold">{hasErrors ? '-' : '$' + (projection.losingTrades * params.riskPerTrade).toFixed(2)}</p>
                </div>
                <div>
                  <span className="text-[#8b949e] text-xs">Loss</span>
                  <p className="text-[#f85149] font-semibold">{hasErrors ? '-' : '-$' + projection.lossPerLoss.toFixed(2)}</p>
                </div>
              </div>
            </div>

            {/* Sharpe Ratio */}
            <div className="flex items-center justify-between py-2 px-3 bg-[#0d1117] rounded-lg">
              <span className="text-sm text-[#8b949e]">Sharpe Ratio</span>
              <span className={`font-semibold ${hasErrors ? 'text-[#8b949e]' : projection.sharpeRatio >= 1 ? 'text-[#3fb950]' : 'text-[#8b949e]'}`}>
                {hasErrors ? '-' : projection.sharpeRatio.toFixed(2)}
              </span>
            </div>
          </div>

          {/* Desktop Table Layout */}
          <div className="hidden md:block space-y-3">
            <div className="grid grid-cols-3 gap-4 text-sm border-b border-[#30363d] pb-2">
              <div></div>
              <div className="text-center text-[#3fb950] font-medium">Winning Trades</div>
              <div className="text-center text-[#f85149] font-medium">Losing Trades</div>
            </div>
            
            <div className="grid grid-cols-3 gap-4 py-2 border-b border-[#21262d] text-sm">
              <span className="text-[#8b949e]">Trades per day</span>
              <span className="text-center text-white">{hasErrors ? '-' : projection.winningTrades.toFixed(2)}</span>
              <span className="text-center text-white">{hasErrors ? '-' : projection.losingTrades.toFixed(2)}</span>
            </div>
            
            <div className="grid grid-cols-3 gap-4 py-2 border-b border-[#21262d] text-sm">
              <span className="text-[#8b949e]">R Per trade</span>
              <span className="text-center text-white">{hasErrors ? '-' : params.rewardToRisk.toFixed(1)}</span>
              <span className="text-center text-white">1.0</span>
            </div>
            
            <div className="grid grid-cols-3 gap-4 py-2 border-b border-[#21262d] text-sm">
              <span className="text-[#8b949e]">Risk Unit</span>
              <span className="text-center text-[#3fb950]">{hasErrors ? '-' : '$' + (projection.winningTrades * params.riskPerTrade).toFixed(2)}</span>
              <span className="text-center text-[#f85149]">{hasErrors ? '-' : '$' + (projection.losingTrades * params.riskPerTrade).toFixed(2)}</span>
            </div>
            
            <div className="grid grid-cols-3 gap-4 py-2 text-sm">
              <span className="text-[#8b949e]">Profit (Gain/Loss)</span>
              <span className="text-center text-[#3fb950] font-semibold">{hasErrors ? '-' : '$' + projection.profitPerWin.toFixed(2)}</span>
              <span className="text-center text-[#f85149] font-semibold">{hasErrors ? '-' : '-$' + projection.lossPerLoss.toFixed(2)}</span>
            </div>
          </div>

          <div className="hidden md:block mt-4 pt-4 border-t border-[#30363d]">
            <div className="flex items-center justify-between text-sm">
              <span className="text-[#8b949e]">Sharpe Ratio</span>
              <span className={`font-semibold ${hasErrors ? 'text-[#8b949e]' : projection.sharpeRatio >= 1 ? 'text-[#3fb950]' : 'text-[#8b949e]'}`}>
                {hasErrors ? '-' : projection.sharpeRatio.toFixed(2)}
              </span>
            </div>
          </div>
        </div>

        {/* Income Projection */}
        <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-4 sm:p-6">
          <h3 className="text-xs sm:text-sm font-medium text-[#8b949e] mb-3 sm:mb-4 flex items-center gap-2">
            <TrendingUp className="w-4 h-4" />
            Income Projection (${isNaN(parseFloat(inputs.riskPerTrade)) ? '0' : inputs.riskPerTrade} Risk)
          </h3>
          
          <div className="space-y-2 sm:space-y-3">
            <ProjectionRow label="Per day" value={hasErrors ? null : projection.netPerDay} />
            <ProjectionRow label="Per week" value={hasErrors ? null : projection.netPerWeek} />
            <ProjectionRow label="Per month" value={hasErrors ? null : projection.netPerMonth} />
            <ProjectionRow label="Per year" value={hasErrors ? null : projection.netPerYear} isTotal />
          </div>
        </div>
      </div>

      {/* Summary Card */}
      <div className="bg-gradient-to-r from-[#F97316]/20 to-[#d97706]/20 border border-[#F97316]/30 rounded-xl p-4 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <p className="text-xs sm:text-sm text-[#8b949e] mb-1">Total Yearly Income (${isNaN(parseFloat(inputs.riskPerTrade)) ? '0' : inputs.riskPerTrade} Risk/Trade)</p>
            <p className="text-2xl sm:text-3xl font-bold text-white">
              {hasErrors ? '-' : '$' + projection.netPerYear.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
          </div>
          <div className="text-left sm:text-right">
            <p className="text-xs sm:text-sm text-[#8b949e] mb-1">Based on</p>
            <p className="text-xs sm:text-sm text-white">{hasErrors ? '-' : `${inputs.tradesPerDay} trades/day @ ${inputs.winRate}% win rate`}</p>
            <p className="text-xs text-[#8b949e]">{hasErrors ? '-' : `${inputs.rewardToRisk}:1 Reward/Risk`}</p>
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
  value: number | null;
  isTotal?: boolean;
}) {
  if (value === null) {
    return (
      <div className={`flex items-center justify-between py-2 ${isTotal ? 'border-t border-[#30363d] pt-3' : 'border-b border-[#21262d] last:border-0'}`}>
        <div className="flex items-center gap-2">
          <Calendar className={`w-4 h-4 ${isTotal ? 'text-[#F97316]' : 'text-[#8b949e]'}`} />
          <span className={`text-sm ${isTotal ? 'text-white font-medium' : 'text-[#8b949e]'}`}>{label}</span>
        </div>
        <span className="text-[#8b949e]">-</span>
      </div>
    );
  }
  
  return (
    <div className={`flex items-center justify-between py-2 ${isTotal ? 'border-t border-[#30363d] pt-3' : 'border-b border-[#21262d] last:border-0'}`}>
      <div className="flex items-center gap-2">
        <Calendar className={`w-4 h-4 ${isTotal ? 'text-[#F97316]' : 'text-[#8b949e]'}`} />
        <span className={`text-sm ${isTotal ? 'text-white font-medium' : 'text-[#8b949e]'}`}>{label}</span>
      </div>
      <span className={`font-semibold text-sm sm:text-base ${value >= 0 ? 'text-[#3fb950]' : 'text-[#f85149]'}`}>
        ${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      </span>
    </div>
  );
}
