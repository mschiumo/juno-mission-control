/**
 * CryptoTrader MCP server (Model Context Protocol, Streamable HTTP transport).
 *
 * Lets external Claude agents (Claude Code, claude.ai connectors, the Anthropic
 * API MCP connector, scheduled agents) observe the crypto screener/portfolio and
 * trade agentically THROUGH the same guardrail-gated execution path as the UI —
 * never around it. Mirrors the stock agent's Robinhood-MCP pattern, with the
 * roles reversed: here we are the MCP server.
 *
 * Authority model (defense in depth):
 *  - Transport auth: middleware.ts requires "Authorization: Bearer AGENT_SECRET".
 *  - Observation + proposal tools always work.
 *  - execute_proposal / close_position additionally require the owner to enable
 *    "MCP trading" in system state (default OFF → agents are propose-only).
 *  - Execution then re-runs EVERY code guardrail (kill switch, paper/live
 *    arming, caps, circuit breaker, cooldown, safety floor). An MCP agent can
 *    never raise a cap or bypass the kill switch — same invariant as the LLM
 *    analyst.
 *  - Every tool call that mutates state is written to the audit log.
 *
 * Protocol: JSON-RPC 2.0 over POST (stateless; no SSE stream). Supports
 * initialize, ping, tools/list, tools/call; notifications get 202.
 * Connect from Claude Code:
 *   claude mcp add --transport http crypto-trader \
 *     https://<host>/api/mcp/crypto --header "Authorization: Bearer $AGENT_SECRET"
 */

import { NextRequest, NextResponse } from 'next/server';
import { getUserByEmail } from '@/lib/db/users';
import { OWNER_EMAIL } from '@/lib/owner';
import { getSystemState } from '@/lib/db/crypto/system-state';
import {
  appendAudit,
  expireStaleProposals,
  getRiskState,
  listAuditEvents,
  listOrders,
  listPositions,
  upsertProposal,
} from '@/lib/db/crypto/collections';
import { newId } from '@/lib/db/crypto/store';
import { runScreener, DEFAULT_FILTERS } from '@/lib/crypto/screener';
import { checkTokenSafety } from '@/lib/crypto/providers/safety';
import { getTokenSnapshot } from '@/lib/crypto/providers/dexscreener';
import { getWalletStatus } from '@/lib/crypto/wallet';
import { executeApprovedProposal, executeSell } from '@/lib/crypto/execution';
import { DEFAULT_LADDER, DEFAULT_TRAILING_STOP_PCT } from '@/lib/crypto/agent/runner';
import type { CryptoChain, CryptoProposal } from '@/types/crypto-trader';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const PROTOCOL_VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05'];
const SERVER_INFO = { name: 'crypto-trader', version: '1.0.0' };

const INSTRUCTIONS = `Crypto screener + guardrail-gated trading for the owner's Juno Mission Control account.

You can always observe (screener, safety, positions, orders, wallet, system state, audit log) and create PENDING trade proposals for the owner to review. execute_proposal and close_position only work when the owner has enabled MCP trading, and every execution re-runs hard code guardrails (kill switch, paper/live arming, per-position and total-exposure caps, daily-loss circuit breaker, post-loss cooldown, safety-score and liquidity floors). Sizes you request are clamped; you cannot raise any limit. Default execution is PAPER unless the server is explicitly armed for live. Be selective: overtrading mediocre setups is the known failure mode.`;

// ---------------------------------------------------------------------------
// Tool definitions
// ---------------------------------------------------------------------------

interface ToolDef {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

const chainSchema = { type: 'string', enum: ['solana', 'ethereum', 'base'] };

const TOOLS: ToolDef[] = [
  {
    name: 'get_system_state',
    description:
      'Trading system state: kill switch, paper/live mode, auto-trade, MCP-trading flag, caps, and today\'s risk counters (realized P&L, consecutive losses, cooldown).',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'get_wallet_status',
    description: 'Dedicated trading hot-wallet status: address and SOL/USDC balances (read-only).',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'get_screener',
    description:
      'Run the crypto momentum screener (DEX Screener discovery, code-scored momentum, RugCheck/GoPlus safety). Returns tokens with momentum score, signals, and safety report.',
    inputSchema: {
      type: 'object',
      properties: {
        chain: { ...chainSchema, description: 'Restrict to one chain (default: all)' },
        safeOnly: { type: 'boolean', description: 'Only tokens with zero hard safety failures' },
        refresh: { type: 'boolean', description: 'Bypass the 2-minute cache' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'get_token_safety',
    description: 'Rug/scam report for one token (RugCheck for Solana, GoPlus for EVM): score 0-100, hard failures, warnings.',
    inputSchema: {
      type: 'object',
      properties: {
        chain: chainSchema,
        tokenAddress: { type: 'string' },
      },
      required: ['chain', 'tokenAddress'],
      additionalProperties: false,
    },
  },
  {
    name: 'get_positions',
    description: 'All positions (open ones include a live mark price and unrealized P&L).',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'get_orders',
    description: 'Recent orders with fills, slippage, and status history.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'get_audit_log',
    description: 'Recent audit events (proposals, orders, position changes, system toggles).',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'create_trade_proposal',
    description:
      'Create a PENDING buy proposal for owner review. Validates the token live (price, liquidity, safety), clamps notional to the per-position cap, and derives the stop from stopPct (clamped 25-60%). Does NOT execute.',
    inputSchema: {
      type: 'object',
      properties: {
        chain: chainSchema,
        tokenAddress: { type: 'string' },
        notionalUsd: { type: 'number', description: 'USD to buy (clamped to per-position cap)' },
        thesis: { type: 'string', description: 'One-two sentence rationale — logged forever' },
        stopPct: { type: 'number', description: 'Stop distance % below entry (default 45, clamped 25-60)' },
        conviction: { type: 'number', description: '0-100 (informational)' },
      },
      required: ['chain', 'tokenAddress', 'notionalUsd', 'thesis'],
      additionalProperties: false,
    },
  },
  {
    name: 'execute_proposal',
    description:
      'Execute a pending proposal through the guardrail-gated path (kill switch, caps, circuit breaker, cooldown, safety floor all re-checked). Requires the owner to have enabled MCP trading; paper fills unless the server is armed for live.',
    inputSchema: {
      type: 'object',
      properties: { proposalId: { type: 'string' } },
      required: ['proposalId'],
      additionalProperties: false,
    },
  },
  {
    name: 'close_position',
    description: 'Close an open position at market (risk-reducing). Requires MCP trading to be enabled by the owner.',
    inputSchema: {
      type: 'object',
      properties: { positionId: { type: 'string' } },
      required: ['positionId'],
      additionalProperties: false,
    },
  },
];

// ---------------------------------------------------------------------------
// Tool implementations
// ---------------------------------------------------------------------------

type ToolArgs = Record<string, unknown>;

async function ownerUserId(): Promise<string> {
  const owner = await getUserByEmail(OWNER_EMAIL);
  if (!owner) throw new Error('Owner account not found');
  return owner.id;
}

async function requireMcpTrading(userId: string): Promise<void> {
  const state = await getSystemState(userId);
  if (!state.mcpTradingEnabled) {
    throw new Error(
      'MCP trading is disabled by the owner. You may create pending proposals with create_trade_proposal; the owner will review them in the app.',
    );
  }
}

async function callTool(name: string, args: ToolArgs): Promise<unknown> {
  const userId = await ownerUserId();

  switch (name) {
    case 'get_system_state': {
      const [state, risk] = await Promise.all([getSystemState(userId), getRiskState(userId)]);
      return { state, risk };
    }

    case 'get_wallet_status':
      return await getWalletStatus();

    case 'get_screener': {
      const chain = (args.chain as CryptoChain | undefined) ?? 'all';
      const snapshot = await runScreener({ ...DEFAULT_FILTERS, chain }, args.refresh === true);
      const results = args.safeOnly === true
        ? snapshot.results.filter((r) => r.safety.hardFails.length === 0)
        : snapshot.results;
      return {
        generatedAt: snapshot.generatedAt,
        results: results.map((r) => ({
          chain: r.token.chainId,
          tokenAddress: r.token.tokenAddress,
          symbol: r.token.symbol,
          name: r.token.name,
          priceUsd: r.token.priceUsd,
          marketCapUsd: r.token.marketCapUsd,
          liquidityUsd: r.token.liquidityUsd,
          volumeH24Usd: r.token.volumeUsd.h24,
          priceChangePct: r.token.priceChangePct,
          ageHours: Math.round(r.token.ageHours),
          momentumScore: r.momentumScore,
          signals: r.signals,
          safety: r.safety,
        })),
      };
    }

    case 'get_token_safety': {
      const snapshot = await getTokenSnapshot(args.chain as CryptoChain, String(args.tokenAddress));
      if (!snapshot) throw new Error('Token not found on DEX Screener');
      const safety = await checkTokenSafety(snapshot);
      return { token: { symbol: snapshot.symbol, priceUsd: snapshot.priceUsd, liquidityUsd: snapshot.liquidityUsd }, safety };
    }

    case 'get_positions': {
      const positions = await listPositions(userId);
      const open = positions.filter((p) => p.status === 'open');
      const marks = await Promise.all(
        open.map(async (p) => ({ id: p.id, mark: (await getTokenSnapshot(p.chainId, p.tokenAddress))?.priceUsd ?? null })),
      );
      const markById = new Map(marks.map((m) => [m.id, m.mark]));
      return positions.slice(0, 50).map((p) => {
        const mark = p.status === 'open' ? markById.get(p.id) ?? null : null;
        return {
          ...p,
          markPriceUsd: mark,
          unrealizedPnlUsd: mark !== null ? +(p.qtyTokens * (mark - p.avgEntryPriceUsd)).toFixed(2) : null,
        };
      });
    }

    case 'get_orders':
      return (await listOrders(userId)).slice(0, 20);

    case 'get_audit_log':
      return (await listAuditEvents(userId)).slice(0, 30);

    case 'create_trade_proposal': {
      const chain = args.chain as CryptoChain;
      const tokenAddress = String(args.tokenAddress);
      const thesis = String(args.thesis ?? '').trim();
      if (!thesis) throw new Error('A thesis is required');

      const state = await getSystemState(userId);
      const snapshot = await getTokenSnapshot(chain, tokenAddress);
      if (!snapshot) throw new Error('Token not found on DEX Screener');
      const safety = await checkTokenSafety(snapshot);
      if (safety.hardFails.length > 0) {
        throw new Error(`Token fails the rug gate: ${safety.hardFails.join('; ')}`);
      }

      const notionalUsd = Math.max(10, Math.min(state.perPositionCapUsd, Number(args.notionalUsd) || 0));
      const stopPct = Math.max(25, Math.min(60, Number(args.stopPct) || 45));
      const conviction = Math.max(0, Math.min(100, Math.round(Number(args.conviction) || 50)));

      const proposal: CryptoProposal = {
        id: newId('prop'),
        chainId: chain,
        tokenAddress,
        pairAddress: snapshot.pairAddress,
        symbol: snapshot.symbol,
        name: snapshot.name,
        direction: 'buy',
        thesis,
        strategy: 'momentum-breakout',
        notionalUsd,
        entryPriceUsd: snapshot.priceUsd,
        stopPriceUsd: snapshot.priceUsd * (1 - stopPct / 100),
        takeProfitLadder: DEFAULT_LADDER,
        trailingStopPct: DEFAULT_TRAILING_STOP_PCT,
        conviction,
        safetyScore: safety.score,
        signals: [],
        status: 'pending',
        expiresAt: new Date(Date.now() + 60 * 60000).toISOString(),
        createdAt: new Date().toISOString(),
      };
      await upsertProposal(userId, proposal);
      await appendAudit(userId, {
        actor: 'agent',
        actorId: 'mcp',
        eventType: 'proposal.created',
        entityType: 'proposal',
        entityId: proposal.id,
        note: `[MCP] ${proposal.symbol} buy $${notionalUsd} — ${thesis}`,
      });
      return { proposalId: proposal.id, proposal, note: 'Pending owner approval (or call execute_proposal if MCP trading is enabled).' };
    }

    case 'execute_proposal': {
      await requireMcpTrading(userId);
      const proposals = await expireStaleProposals(userId);
      const proposal = proposals.find((p) => p.id === String(args.proposalId));
      if (!proposal) throw new Error('Proposal not found');
      if (proposal.status !== 'pending') throw new Error(`Proposal is ${proposal.status}`);

      proposal.status = 'approved';
      proposal.decidedAt = new Date().toISOString();
      proposal.decidedBy = 'mcp-agent';
      await upsertProposal(userId, proposal);

      const result = await executeApprovedProposal(userId, proposal, 'agent', 'mcp');
      if (!result.ok) {
        throw new Error(`Execution blocked: ${result.error}${result.guardrailCode ? ` (${result.guardrailCode})` : ''}`);
      }
      return { order: result.order, position: result.position };
    }

    case 'close_position': {
      await requireMcpTrading(userId);
      const positions = await listPositions(userId);
      const position = positions.find((p) => p.id === String(args.positionId));
      if (!position || position.status !== 'open') throw new Error('Open position not found');

      const snapshot = await getTokenSnapshot(position.chainId, position.tokenAddress);
      if (!snapshot) throw new Error('No current price available');
      const state = await getSystemState(userId);
      const result = await executeSell(
        userId, position, position.qtyTokens, 'manual_close', state, snapshot.priceUsd, snapshot.liquidityUsd, 'mcp',
      );
      if (!result.ok) throw new Error(`Close failed: ${result.error}`);
      return { order: result.order, position: result.position };
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// ---------------------------------------------------------------------------
// JSON-RPC plumbing
// ---------------------------------------------------------------------------

interface JsonRpcRequest {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: Record<string, unknown>;
}

const rpcResult = (id: string | number | null, result: unknown) =>
  NextResponse.json({ jsonrpc: '2.0', id, result });

const rpcError = (id: string | number | null, code: number, message: string) =>
  NextResponse.json({ jsonrpc: '2.0', id, error: { code, message } });

export async function POST(request: NextRequest) {
  let msg: JsonRpcRequest;
  try {
    msg = await request.json();
  } catch {
    return rpcError(null, -32700, 'Parse error');
  }
  if (Array.isArray(msg)) {
    return rpcError(null, -32600, 'Batch requests are not supported');
  }

  const id = msg.id ?? null;

  // Notifications (no id) are acknowledged without a body.
  if (msg.id === undefined && typeof msg.method === 'string') {
    return new NextResponse(null, { status: 202 });
  }

  switch (msg.method) {
    case 'initialize': {
      const requested = String(msg.params?.protocolVersion ?? '');
      const protocolVersion = PROTOCOL_VERSIONS.includes(requested) ? requested : PROTOCOL_VERSIONS[0];
      return rpcResult(id, {
        protocolVersion,
        capabilities: { tools: {} },
        serverInfo: SERVER_INFO,
        instructions: INSTRUCTIONS,
      });
    }

    case 'ping':
      return rpcResult(id, {});

    case 'tools/list':
      return rpcResult(id, { tools: TOOLS });

    case 'tools/call': {
      const name = String(msg.params?.name ?? '');
      const args = (msg.params?.arguments ?? {}) as ToolArgs;
      try {
        const result = await callTool(name, args);
        return rpcResult(id, {
          content: [{ type: 'text', text: JSON.stringify(result, null, 1) }],
        });
      } catch (error) {
        // Tool-level failures are results with isError, not protocol errors.
        return rpcResult(id, {
          content: [{ type: 'text', text: error instanceof Error ? error.message : 'Tool call failed' }],
          isError: true,
        });
      }
    }

    default:
      return rpcError(id, -32601, `Method not found: ${msg.method}`);
  }
}

/** Streamable HTTP GET opens an SSE stream — we are stateless, so decline. */
export async function GET() {
  return NextResponse.json({ error: 'SSE not supported; POST JSON-RPC messages' }, { status: 405 });
}
