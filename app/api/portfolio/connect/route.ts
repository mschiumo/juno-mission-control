/**
 * POST /api/portfolio/connect — Platinum feature (owner always included).
 *
 * Starts the long-term portfolio brokerage connection flow. Registers a
 * SEPARATE SnapTrade user (`<userId>-portfolio`) on first use so the portfolio
 * connection can never mingle with the trading connection (whose SnapTrade
 * userId is the bare app userId), then returns a Connection Portal URL.
 *
 * No connection cap here: this is an owner-only surface, and the portal for an
 * existing user doubles as the place to repair or replace a broken link.
 */

import { NextResponse } from 'next/server';
import { requireFeature } from '@/lib/auth-session';
import {
  isSnapTradeConfigured,
  registerUser,
  generateConnectionPortalUrl,
} from '@/lib/snaptrade';
import {
  getPortfolioConnection,
  savePortfolioConnection,
  portfolioSnaptradeUserId,
} from '@/lib/db/portfolio-connection';

/** Where SnapTrade drops the user after the Connection Portal flow. */
const PORTFOLIO_RETURN_PATH = '/portfolio/connected';

export async function POST(): Promise<NextResponse> {
  const { userId, error: authError } = await requireFeature('portfolio');
  if (authError) return authError;

  if (!isSnapTradeConfigured()) {
    return NextResponse.json(
      { success: false, error: 'Brokerage connections are not configured yet.' },
      { status: 503 }
    );
  }

  try {
    let connection = await getPortfolioConnection(userId);

    // First connect: register the dedicated portfolio SnapTrade user and
    // persist the issued userSecret (it cannot be retrieved again later).
    if (!connection) {
      const { userId: snaptradeUserId, userSecret } = await registerUser(
        portfolioSnaptradeUserId(userId)
      );
      connection = {
        userId,
        snaptradeUserId,
        userSecret,
        accounts: [],
        connectedAt: new Date().toISOString(),
      };
      await savePortfolioConnection(connection);
    }

    // Same redirect convention as /api/snaptrade/connect: a bare origin gets
    // the return path appended; an explicit URL with a path is used as-is.
    const redirectBase =
      process.env.SNAPTRADE_PORTFOLIO_REDIRECT_URL ||
      process.env.NEXT_PUBLIC_APP_URL ||
      undefined;
    let customRedirect = redirectBase;
    if (redirectBase) {
      try {
        const u = new URL(redirectBase);
        if (u.pathname === '/' || u.pathname === '') {
          u.pathname = PORTFOLIO_RETURN_PATH;
          customRedirect = u.toString();
        }
      } catch {
        // Not a parseable absolute URL — hand it to SnapTrade untouched.
      }
    }

    const url = await generateConnectionPortalUrl({
      snaptradeUserId: connection.snaptradeUserId,
      userSecret: connection.userSecret,
      customRedirect,
      connectionType: 'read',
    });

    return NextResponse.json({ success: true, url });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error('Portfolio connect error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to start brokerage connection', detail },
      { status: 500 }
    );
  }
}
