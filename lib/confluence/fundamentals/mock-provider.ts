/**
 * Deterministic MOCK fundamentals provider (Milestone 1/2 scaffolding).
 *
 * Returns a fixed small universe with fixed, obviously-synthetic fundamentals so
 * the agent-run pipeline can be exercised end to end before the real Massive
 * integration exists. NONE of these numbers are real market data.
 */

import type { Fundamentals, FundamentalsProvider } from './provider';

const MOCK_DATA: Record<string, Fundamentals> = {
  AAPL: { symbol: 'AAPL', price: 184.2, peTtm: 29.1, forwardPe: 26.4, grossMargin: 0.462, operatingMargin: 0.301, revenueGrowthYoY: 0.049, freeCashFlow: 99_000_000_000, dividendYield: 0.005 },
  MSFT: { symbol: 'MSFT', price: 409.0, peTtm: 34.7, forwardPe: 30.1, grossMargin: 0.69, operatingMargin: 0.446, revenueGrowthYoY: 0.17, freeCashFlow: 70_000_000_000, dividendYield: 0.007 },
  KO: { symbol: 'KO', price: 60.6, peTtm: 24.0, forwardPe: 22.5, grossMargin: 0.59, operatingMargin: 0.29, revenueGrowthYoY: 0.032, freeCashFlow: 9_500_000_000, dividendYield: 0.031 },
  NVDA: { symbol: 'NVDA', price: 121.4, peTtm: 62.0, forwardPe: 34.0, grossMargin: 0.75, operatingMargin: 0.62, revenueGrowthYoY: 1.22, freeCashFlow: 39_000_000_000, dividendYield: 0.0003 },
  JNJ: { symbol: 'JNJ', price: 152.1, peTtm: 22.4, forwardPe: 15.0, grossMargin: 0.69, operatingMargin: 0.25, revenueGrowthYoY: 0.061, freeCashFlow: 18_000_000_000, dividendYield: 0.032 },
  PG: { symbol: 'PG', price: 167.3, peTtm: 27.6, forwardPe: 24.1, grossMargin: 0.51, operatingMargin: 0.24, revenueGrowthYoY: 0.023, freeCashFlow: 15_000_000_000, dividendYield: 0.024 },
};

export class MockFundamentalsProvider implements FundamentalsProvider {
  readonly name = 'mock';

  async getUniverse(): Promise<string[]> {
    return Object.keys(MOCK_DATA);
  }

  async getFundamentals(symbol: string): Promise<Fundamentals | null> {
    return MOCK_DATA[symbol] ?? null;
  }
}
