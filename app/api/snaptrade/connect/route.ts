/**
 * POST /api/snaptrade/connect
 *
 * Starts the brokerage connection flow. Ensures the user is registered with
 * SnapTrade (storing the issued userSecret on first connect), then returns a
 * one-time Connection Portal URL the client opens (redirect or iframe) for the
 * user to pick a brokerage and log in.
 */

import { NextResponse } from 'next/server';
import { requireOwner } from '@/lib/auth-session';
import {
  isSnapTradeConfigured,
  registerUser,
  generateConnectionPortalUrl,
  countConnections,
} from '@/lib/snaptrade';
import {
  getBrokerConnection,
  saveBrokerConnection,
  MAX_BROKER_CONNECTIONS,
} from '@/lib/db/broker-connections';

export async function POST(): Promise<NextResponse> {
  const { userId, error: authError } = await requireOwner();
  if (authError) return authError;

  if (!isSnapTradeConfigured()) {
    return NextResponse.json(
      { success: false, error: 'Brokerage connections are not configured yet.' },
      { status: 503 }
    );
  }

  try {
    let connection = await getBrokerConnection(userId);

    // First connect: register with SnapTrade and persist the userSecret.
    // Re-registering an existing userId errors, so we only do this once.
    if (!connection) {
      const { userId: snaptradeUserId, userSecret } = await registerUser(userId);
      connection = {
        userId,
        snaptradeUserId,
        userSecret,
        accounts: [],
        connectedAt: new Date().toISOString(),
      };
      await saveBrokerConnection(connection);
    } else {
      // Existing user adding another brokerage — enforce the connection cap.
      let connectionCount: number;
      try {
        connectionCount = await countConnections({
          snaptradeUserId: connection.snaptradeUserId,
          userSecret: connection.userSecret,
        });
      } catch {
        // SnapTrade unreachable — fall back to distinct authorizations we've cached.
        connectionCount = new Set(
          connection.accounts.map(a => a.authorizationId).filter(Boolean)
        ).size;
      }
      if (connectionCount >= MAX_BROKER_CONNECTIONS) {
        return NextResponse.json(
          {
            success: false,
            code: 'LIMIT_REACHED',
            limit: MAX_BROKER_CONNECTIONS,
            error: `You can connect up to ${MAX_BROKER_CONNECTIONS} brokerage accounts. Disconnect one to add a different brokerage.`,
          },
          { status: 409 }
        );
      }
    }

    const customRedirect =
      process.env.SNAPTRADE_REDIRECT_URL || process.env.NEXT_PUBLIC_APP_URL || undefined;

    const url = await generateConnectionPortalUrl({
      snaptradeUserId: connection.snaptradeUserId,
      userSecret: connection.userSecret,
      customRedirect,
      connectionType: 'read',
    });

    return NextResponse.json({ success: true, url });
  } catch (error) {
    console.error('SnapTrade connect error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to start brokerage connection' },
      { status: 500 }
    );
  }
}
