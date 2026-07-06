/**
 * Technicals provider factory — selects the bar source by config.
 *
 * `CONFLUENCE_TECHNICALS_PROVIDER` = 'mock' | 'robinhood' (defaults to 'mock',
 * which is deterministic and credential-free, so the paper-mode pipeline always
 * runs). Switch to 'robinhood' once the server-side Robinhood OAuth token is
 * provisioned — same gate as the fundamentals provider.
 */

import type { TechnicalsProvider } from './provider';
import { MockTechnicalsProvider } from './mock-provider';
import { RobinhoodTechnicalsProvider } from './robinhood-provider';

let singleton: TechnicalsProvider | null = null;
let singletonKey: string | null = null;

export function getTechnicalsProvider(): TechnicalsProvider {
  const choice = (process.env.CONFLUENCE_TECHNICALS_PROVIDER || 'mock').toLowerCase();

  // Refuse the one genuinely dangerous configuration: real fundamentals with
  // mock bars. The mock is engineered to PASS the technical gate at hardcoded
  // prices, so real names would be proposed with limits/stops computed off
  // fictional bars — a marketable order at a made-up price. Mock is only valid
  // end-to-end (mock fundamentals) or not at all.
  const fundamentals = (process.env.CONFLUENCE_FUNDAMENTALS_PROVIDER || 'mock').toLowerCase();
  if (choice === 'mock' && fundamentals !== 'mock') {
    throw new Error(
      `CONFLUENCE_FUNDAMENTALS_PROVIDER=${fundamentals} with CONFLUENCE_TECHNICALS_PROVIDER=mock would price real ` +
        'symbols off synthetic bars. Set CONFLUENCE_TECHNICALS_PROVIDER=robinhood (or use mock for both).',
    );
  }

  if (singleton && singletonKey === choice) return singleton;

  switch (choice) {
    case 'robinhood':
      singleton = new RobinhoodTechnicalsProvider();
      break;
    case 'mock':
    default:
      singleton = new MockTechnicalsProvider();
      break;
  }
  singletonKey = choice;
  return singleton;
}

export type { OhlcvBar, Technicals, TechnicalsProvider } from './provider';
