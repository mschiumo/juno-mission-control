/**
 * Live Robinhood positions for the pinned agentic account (owner-only).
 *
 * READ-ONLY — fetched straight from the broker on every request, so whatever
 * Robinhood says you hold is what renders (including manual trades made
 * outside the app). Each position is annotated with its active protective
 * stop (or its absence — the UI flags uncovered positions loudly).
 */

import { NextResponse } from 'next/server';
import { requireOwner } from '@/lib/auth-session';
import { getSystemState } from '@/lib/db/confluence/system-state';
import { getActiveOrders, getAllOrders } from '@/lib/db/confluence/orders';
import { callRobinhoodTool, isRobinhoodConfigured } from '@/lib/confluence/robinhood/mcp-client';

export const dynamic = 'force-dynamic';

interface RhPosition {
  symbol?: string;
  quantity?: string | number;
  average_buy_price?: string | number;
  avg_cost?: string | number;
  average_price?: string | number;
}

function num(v: string | number | undefined): number | undefined {
  if (v == null) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

export async function GET(): Promise<NextResponse> {
  const { userId, error } = await requireOwner();
  if (error) return error;

  const state = await getSystemState(userId);
  if (!state.agenticAccount) {
    return NextResponse.json({ success: true, positions: [], reason: 'No agentic account pinned.' });
  }
  if (!isRobinhoodConfigured()) {
    return NextResponse.json({ success: true, positions: [], reason: 'Robinhood is not configured on the server.' });
  }

  try {
    const res = await callRobinhoodTool<{ data?: { positions?: RhPosition[]; results?: RhPosition[] } }>(
      'get_equity_positions',
      { account_number: state.agenticAccount },
      { retries: 2 }, // read-only — retries are safe
    );
    const raw = res?.data?.positions ?? res?.data?.results ?? [];

    // Annotate with active protective-stop coverage from the app's ledger,
    // the approved TARGET from the most recent filled entry, and the live
    // quote so the UI can flag positions trading at/above take-profit.
    const allOrders = await getAllOrders(userId);
    const activeStops = (await getActiveOrders(userId)).filter((o) => o.kind === 'protective_stop');
    const targetFor = (symbol: string): number | undefined => {
      const entries = allOrders
        .filter(
          (o) =>
            o.symbol.toUpperCase() === symbol &&
            (o.kind ?? 'entry') === 'entry' &&
            o.filledQuantity > 0 &&
            typeof o.targetPrice === 'number',
        )
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      return entries[0]?.targetPrice;
    };

    const symbols = [...new Set(raw.map((p) => (p.symbol || '').toUpperCase()).filter(Boolean))];
    const lastPrices = new Map<string, number>();
    if (symbols.length > 0) {
      try {
        const q = await callRobinhoodTool<{
          data?: { results?: { quote?: { symbol?: string; last_trade_price?: string } }[] };
        }>('get_equity_quotes', { symbols: symbols.slice(0, 20) }, { retries: 2 });
        for (const entry of q?.data?.results ?? []) {
          const sym = entry.quote?.symbol?.toUpperCase();
          const last = Number(entry.quote?.last_trade_price);
          if (sym && Number.isFinite(last)) lastPrices.set(sym, last);
        }
      } catch {
        /* quotes are advisory — positions still render without them */
      }
    }

    const positions = raw
      .map((p) => {
        const symbol = (p.symbol || '').toUpperCase();
        const quantity = num(p.quantity) ?? 0;
        if (!symbol || quantity === 0) return null;
        const stop = activeStops.find((o) => o.symbol.toUpperCase() === symbol);
        const target = targetFor(symbol);
        const last = lastPrices.get(symbol);
        return {
          symbol,
          quantity,
          avgCost: num(p.average_buy_price ?? p.avg_cost ?? p.average_price),
          stop: stop ? { stopPrice: stop.stopPrice ?? stop.limitPrice, quantity: stop.quantity } : null,
          target: target ?? null,
          lastPrice: last ?? null,
          atTarget: target != null && last != null ? last >= target : false,
        };
      })
      .filter(Boolean);

    return NextResponse.json({ success: true, account: state.agenticAccount, positions });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Positions lookup failed';
    return NextResponse.json({ success: false, error: message }, { status: 502 });
  }
}
