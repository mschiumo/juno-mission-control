/**
 * Broker adapter factory.
 *
 * Resolves the {@link BrokerAdapter} for the current mode. `paper` → the
 * deterministic paper adapter. `live` → the real Robinhood-MCP adapter, but ONLY
 * when the server-side kill flag CONFLUENCE_ALLOW_LIVE=true is set. That env gate
 * is deliberate belt-and-suspenders: even if the UI is flipped to live mode, real
 * orders cannot be placed unless an operator has also armed live at the server.
 */

import type { BrokerAdapter } from './adapter';
import { PaperBrokerAdapter } from './paper-adapter';
import { LiveRobinhoodAdapter } from './live-adapter';

let paperSingleton: PaperBrokerAdapter | null = null;
let liveSingleton: LiveRobinhoodAdapter | null = null;

/** Whether live execution is permitted at the server (deploy-level gate). */
export function isLiveAllowed(): boolean {
  return process.env.CONFLUENCE_ALLOW_LIVE === 'true';
}

export function getBrokerAdapter(paperMode: boolean): BrokerAdapter {
  if (paperMode) {
    if (!paperSingleton) paperSingleton = new PaperBrokerAdapter();
    return paperSingleton;
  }
  // Live mode.
  if (!isLiveAllowed()) {
    throw new Error(
      'Live execution is disabled at the server. Set CONFLUENCE_ALLOW_LIVE=true to permit real orders ' +
        '(and keep the kill switch, exposure caps, and a pinned agentic account in place).',
    );
  }
  if (!liveSingleton) liveSingleton = new LiveRobinhoodAdapter();
  return liveSingleton;
}

export type { BrokerAdapter } from './adapter';
