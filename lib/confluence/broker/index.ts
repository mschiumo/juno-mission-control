/**
 * Broker adapter factory.
 *
 * Resolves the {@link BrokerAdapter} for the current mode. Today only the
 * deterministic paper adapter exists; the live Robinhood-MCP adapter is added in
 * Milestone 3. Requesting a live adapter before then throws loudly rather than
 * silently falling back — a "live" approval must never quietly execute on paper,
 * or vice versa.
 */

import type { BrokerAdapter } from './adapter';
import { PaperBrokerAdapter } from './paper-adapter';

let paperSingleton: PaperBrokerAdapter | null = null;

export function getBrokerAdapter(paperMode: boolean): BrokerAdapter {
  if (paperMode) {
    if (!paperSingleton) paperSingleton = new PaperBrokerAdapter();
    return paperSingleton;
  }
  throw new Error(
    'Live execution is not available yet (Milestone 3). Keep ConfluenceTrading in paper mode until the ' +
      'Robinhood MCP adapter is wired and exposure caps are verified.',
  );
}

export type { BrokerAdapter } from './adapter';
