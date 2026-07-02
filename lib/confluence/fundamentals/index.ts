/**
 * Fundamentals provider factory.
 *
 * Resolves the {@link FundamentalsProvider} the agent runner should use. Today
 * only the deterministic mock exists; the real MassiveFundamentalsProvider is
 * dropped in here once the plan tier is confirmed (owner open item).
 */

import type { FundamentalsProvider } from './provider';
import { MockFundamentalsProvider } from './mock-provider';

let mockSingleton: MockFundamentalsProvider | null = null;

export function getFundamentalsProvider(): FundamentalsProvider {
  // TODO(M2): return a MassiveFundamentalsProvider when configured.
  if (!mockSingleton) mockSingleton = new MockFundamentalsProvider();
  return mockSingleton;
}

export type { Fundamentals, FundamentalsProvider } from './provider';
