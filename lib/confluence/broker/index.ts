/**
 * Broker adapter factory.
 *
 * Resolves the {@link BrokerAdapter} for a given execution mode. Today only the
 * deterministic paper adapter exists; the live Robinhood-MCP adapter is added in
 * Milestone 3. Selecting `live` before then throws loudly rather than silently
 * falling back — we never want a "live" approval to quietly execute on paper, or
 * vice versa.
 */

import type { ExecutionMode } from '@/types/confluence';
import type { BrokerAdapter } from './adapter';
import { PaperBrokerAdapter } from './paper-adapter';

let paperSingleton: PaperBrokerAdapter | null = null;

export function getBrokerAdapter(mode: ExecutionMode): BrokerAdapter {
  if (mode === 'paper') {
    if (!paperSingleton) paperSingleton = new PaperBrokerAdapter();
    return paperSingleton;
  }
  // mode === 'live'
  throw new Error(
    'Live execution is not available yet (Milestone 3). ' +
      'Keep ConfluenceTrading in paper mode until the Robinhood MCP adapter is wired and exposure caps are verified.',
  );
}

export type { BrokerAdapter } from './adapter';
