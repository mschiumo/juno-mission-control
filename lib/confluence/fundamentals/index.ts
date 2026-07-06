/**
 * Fundamentals provider factory — selects the data source by config.
 *
 * `CONFLUENCE_FUNDAMENTALS_PROVIDER` = 'mock' | 'robinhood' | 'massive'
 * (defaults to 'mock', which is deterministic and needs no credentials, so the
 * paper-mode pipeline always runs). Switch to 'robinhood' or 'massive' once the
 * respective server-side credentials are provisioned (see each provider file).
 */

import type { FundamentalsProvider } from './provider';
import { MockFundamentalsProvider } from './mock-provider';
import { RobinhoodFundamentalsProvider } from './robinhood-provider';
import { MassiveFundamentalsProvider } from './massive-provider';

let singleton: FundamentalsProvider | null = null;
let singletonKey: string | null = null;

export function getFundamentalsProvider(): FundamentalsProvider {
  const choice = (process.env.CONFLUENCE_FUNDAMENTALS_PROVIDER || 'mock').toLowerCase();
  if (singleton && singletonKey === choice) return singleton;

  switch (choice) {
    case 'robinhood':
      singleton = new RobinhoodFundamentalsProvider();
      break;
    case 'massive':
      singleton = new MassiveFundamentalsProvider();
      break;
    case 'mock':
    default:
      singleton = new MockFundamentalsProvider();
      break;
  }
  singletonKey = choice;
  return singleton;
}

export type { Fundamentals, FundamentalsProvider } from './provider';
