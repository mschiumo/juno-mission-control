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
