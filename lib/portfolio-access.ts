/**
 * Portfolio connection teardown — the cost-control half of the Platinum
 * portfolio feature, mirroring lib/brokerage-access.ts for the trading link.
 *
 * The portfolio is a SEPARATE billed SnapTrade user (`<userId>-portfolio`),
 * so every path that ends a user's Platinum access — self-disconnect, plan
 * cancel, admin revoke/downgrade, the nightly entitlements sweep, account
 * deletion — must end in "portfolio SnapTrade user deregistered", not just a
 * hidden tab. Failed deregistrations go to the same orphan set the nightly
 * sweep retries.
 */

import { isSnapTradeConfigured, deleteUser } from '@/lib/snaptrade';
import { recordOrphan } from '@/lib/brokerage-access';
import {
  getPortfolioConnection,
  deletePortfolioConnection,
  clearPortfolioData,
} from '@/lib/db/portfolio-connection';

export interface DisconnectPortfolioResult {
  disconnected: boolean;
  hadConnection: boolean;
  deregistered: boolean;
  /** True when deleteUser failed and the id was queued for the nightly retry. */
  orphaned: boolean;
}

/**
 * Remove a user's portfolio connection end to end: deregister the dedicated
 * portfolio SnapTrade user (orphan-queued on failure), clear the portfolio
 * data stores (snapshot, activities, reviews), and delete the connection
 * record. Local clears run before the record is deleted so a mid-flight
 * failure leaves the record in place and a retry re-runs the whole cleanup.
 */
export async function disconnectPortfolio(userId: string): Promise<DisconnectPortfolioResult> {
  const connection = await getPortfolioConnection(userId);
  if (!connection) {
    return { disconnected: true, hadConnection: false, deregistered: false, orphaned: false };
  }

  let deregistered = false;
  let orphaned = false;
  if (isSnapTradeConfigured()) {
    try {
      await deleteUser(connection.snaptradeUserId);
      deregistered = true;
    } catch (error) {
      console.error('Portfolio deleteUser failed; queueing for retry:', error);
      await recordOrphan(connection.snaptradeUserId);
      orphaned = true;
    }
  }

  await clearPortfolioData(userId);
  await deletePortfolioConnection(userId);

  return { disconnected: true, hadConnection: true, deregistered, orphaned };
}
