'use client';

import { useState, useMemo } from 'react';
import { Calculator, TrendingUp, DollarSign, Target, Percent, Calendar } from 'lucide-react';

interface RiskScenario {
  label: string;
  riskPerTrade: number;
  tradesPerDay: number;
  rewardToRisk: number;
  winRate: number;
}

const DEFAULT_SCENARIOS: RiskScenario[] = [
  { label: '$10 Risk', riskPerTrade: 10, tradesPerDay: 15, rewardToRisk: 2.0, winRate: 0.5 },
  { label: '$50 Risk', riskPerTrade: 50, tradesPerDay: 15, rewardToRisk: 2.0, winRate: 0.5 },
  { label: '$100 Risk', riskPerTrade: 100, tradesPerDay: 15, rewardToRisk: 2.0, winRate: 0.5 },
];

interface ProjectionResult {
  winningTrades: number;
  losingTrades: number;
  rPerTradeWin: number;
  rPerTradeLoss: number;
  riskUnitWin: number;
  riskUnitLoss: number;
  profitPerWin: number;
  lossPerLoss: number;
  totalProfit: number;
  totalLoss: number;
  netPerDay: number;
  netPerWeek: number;
  netPerMonth: number;
  netPerYear: number;
  sharpeRatio: number;
}

function calculateProjection(scenario: RiskScenario): ProjectionResult {
  const { riskPerTrade, tradesPerDay, rewardToRisk, winRate } = scenario;
  
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
  
  // Sharpe ratio approximation
  const avgWin = profitPerWin;
  const avgLoss = lossPerLoss;
  const sharpeRatio = avgLoss > 0 ? avgWin / avgLoss : 0;
  
  return {
    winningTrades,
    losingTrades,
    rPerTradeWin: rewardToRisk,
    rPerTradeLoss: 1,
    riskUnitWin: winningTrades,
    riskUnitLoss: -losingTrades,
    profitPerWin,
    lossPerLoss,
    totalProfit,
    totalLoss,
    netPerDay,
    netPerWeek,
    netPerMonth,
    netPerYear,
    sharpeRatio,
  };
}

export default function ProfitProjectionView() {
  const [activeScenario, setActiveScenario] = useState(0);
  const [scenarios, setScenarios] = useState(DEFAULT_SCENARIOS);
  
  const currentScenario = scenarios[activeScenario];
  const projection = useMemo(() => calculateProjection(currentScenario), [currentScenario]);
  
  const updateScenario = (field: keyof RiskScenario, value: number) => {
    setScenarios(prev => {
      const updated = [...prev];
      updated[activeScenario] = { ...updated[activeScenario], [field]: value };
      return updated;
    });
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

      {/* Risk Tabs */}
      <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-2">
        <div className="flex flex-wrap gap-1">
          {scenarios.map((scenario, index) => (
            <button
              key={index}
              onClick={() => setActiveScenario(index)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all ${
                activeScenario === index
                  ? 'bg-[#F97316] text-white'
                  : 'text-[#8b949e] hover:bg-[#262626] hover:text-white'
              }`}
            >
              <DollarSign className="w-4 h-4" />
              <span className="text-sm font-medium">{scenario.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Inputs */}
      <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-6">
        <h3 className="text-sm font-medium text-[#8b949e] mb-4 flex items-center gap-2">
          <Target className="w-4 h-4" />
          Trading Parameters
        </h3>
        
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <InputField
            label="Trades/Day"
            value={currentScenario.tradesPerDay}
            onChange={(v) => updateScenario('tradesPerDay', v)}
            min={1}
            max={100}
          />
          <InputField
            label="Risk/Trade ($)"
            value={currentScenario.riskPerTrade}
            onChange={(v) => updateScenario('riskPerTrade', v)}
            min={1}
            step={5}
          />
          <InputField
            label="Reward:Risk"
            value={currentScenario.rewardToRisk}
            onChange={(v) => updateScenario('rewardToRisk', v)}
            min={0.5}
            step={0.5}
          />
          <InputField
            label="Win Rate (%)"
            value={currentScenario.winRate * 100}
            onChange={(v) => updateScenario('winRate', v / 100)}
            min={0}
            max={100}
            suffix="%"
          />
        </div>
      </div>

      {/* Results Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Trade Breakdown */}
        <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-6">
          <h3 className="text-sm font-medium text-[#8b949e] mb-4">Trade Breakdown</h3>
          
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div></div>
              <div className="text-center text-[#3fb950] font-medium">Winning Trades</div>
              <div className="text-center text-[#f85149] font-medium">Losing Trades</div>
            </div>
            
            <BreakdownRow label="Trades per day" win={projection.winningTrades} loss={projection.losingTrades} />
            <BreakdownRow label="R Per trade" win={projection.rPerTradeWin} loss={projection.rPerTradeLoss} />
            <BreakdownRow label="Risk Unit" win={projection.riskUnitWin} loss={projection.riskUnitLoss} format="$" />
            <BreakdownRow label="Profit (Gain/Loss)" win={projection.profitPerWin} loss={-projection.lossPerLoss} format="$" isCurrency />
          </div>
        </div>

        {/* Income Projection */}
        <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-6">
          <h3 className="text-sm font-medium text-[#8b949e] mb-4 flex items-center gap-2">
            <TrendingUp className="w-4 h-4" />
            Income Projection
          </h3>
          
          <div className="space-y-3">
            <ProjectionRow label="Per day" value={projection.netPerDay} />
            <ProjectionRow label="Per week" value={projection.netPerWeek} />
            <ProjectionRow label="Per month" value={projection.netPerMonth} />
            <ProjectionRow label="Per year" value={projection.netPerYear} isTotal />
          </div>
          
          <div className="mt-4 pt-4 border-t border-[#30363d]">
            <div className="flex items-center justify-between">
              <span className="text-sm text-[#8b949e]">Sharpe Ratio</span>
              <span className={`font-semibold ${projection.sharpeRatio >= 1 ? 'text-[#3fb950]' : 'text-[#8b949e]'}`}>
                {projection.sharpeRatio.toFixed(2)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Summary Card */}
      <div className="bg-gradient-to-r from-[#F97316]/20 to-[#d97706]/20 border border-[#F97316]/30 rounded-xl p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-[#8b949e] mb-1">Total Yearly Income</p>
            <p className="text-3xl font-bold text-white">
              ${projection.netPerYear.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
          </div>
          <div className="text-right">
            <p className="text-sm text-[#8b949e] mb-1">Risk/Trade</p>
            <p className="text-xl font-semibold text-[#F97316]">${currentScenario.riskPerTrade}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function InputField({ 
  label, 
  value, 
  onChange, 
  min = 0, 
  max,
  step = 1,
  suffix = ''
}: { 
  label: string;
  value: number;
  onChange: (val: number) => void;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
}) {
  return (
    <div>
      <label className="block text-xs text-[#8b949e] mb-1.5">{label}</label>
      <div className="relative">
        <input
          type="number"
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
          min={min}
          max={max}
          step={step}
          className="w-full px-3 py-2 bg-[#0d1117] border border-[#30363d] rounded-lg text-white text-sm focus:outline-none focus:border-[#F97316]"
        />
        {suffix && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8b949e] text-xs">{suffix}</span>
        )}
      </div>
    </div>
  );
}

function BreakdownRow({ 
  label, 
  win, 
  loss, 
  format = '',
  isCurrency = false
}: { 
  label: string;
  win: number;
  loss: number;
  format?: string;
  isCurrency?: boolean;
}) {
  const formatNum = (n: number) => {
    if (isCurrency) {
      const absVal = Math.abs(n);
      return `${n >= 0 ? '' : '-'}${format}${absVal.toFixed(2)}`;
    }
    return `${format}${n.toFixed(n % 1 === 0 ? 0 : 2)}`;
  };

  return (
    <div className="grid grid-cols-3 gap-4 py-2 border-b border-[#21262d] last:border-0 text-sm">
      <span className="text-[#8b949e]">{label}</span>
      <span className="text-center text-[#3fb950]">{formatNum(win)}</span>
      <span className="text-center text-[#f85149]">{formatNum(loss)}</span>
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
        <span className={isTotal ? 'text-white font-medium' : 'text-[#8b949e] text-sm'}>{label}</span>
      </div>
      <span className={`font-semibold ${value >= 0 ? 'text-[#3fb950]' : 'text-[#f85149]'}`}>
        ${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      </span>
    </div>
  );
}
