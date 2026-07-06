/**
 * Claude MCP-client analyst (Milestone 2, the real agent path).
 *
 * Runs the analysis as a Claude call with the Robinhood Trading MCP attached as
 * a remote MCP connector, so the OAuth the user already granted is what's used —
 * no separate REST credentials. Claude reads fundamentals/quotes/positions via
 * the MCP and returns structured proposal candidates.
 *
 * ── The hard "no execution authority" rule is enforced HERE, in code ──
 * The MCP toolset is an ALLOWLIST: default_config disables every tool, and only
 * read-only tools are re-enabled. The order-placement tools (place_equity_order,
 * place_option_order, cancel_*) are never enabled, so an LLM misinterpretation
 * cannot move money — the worst case is a proposal the user rejects.
 *
 * ⚠️ NOT E2E-VERIFIED FROM DEV: this path needs ANTHROPIC_API_KEY plus a
 * server-side Robinhood MCP OAuth token (ROBINHOOD_MCP_TOKEN) for the connector's
 * authorization_token. It is built to the documented MCP-connector API but was
 * not exercised end to end here (no egress / no server-side token). Inert until
 * both are set — the runner falls back to the deterministic path otherwise.
 */

import Anthropic from '@anthropic-ai/sdk';
import { ConfluenceNotConfigured, getRobinhoodAccessToken } from '@/lib/confluence/robinhood/oauth';
import { getAgentUniverse } from './universe';
import { getStrategy } from './strategies';
import type { Candidate } from './strategy';
import type { FundamentalMetric } from '@/types/confluence';

const DEFAULT_MODEL = 'claude-opus-4-8';
const DEFAULT_RH_MCP_URL = 'https://agent.robinhood.com/mcp/trading';

/**
 * Read-only Robinhood MCP tools the analyst may call. Everything else — every
 * order-placement / cancel / watchlist-write tool — stays disabled.
 */
const ROBINHOOD_READ_ONLY_TOOLS = [
  'get_accounts',
  'get_portfolio',
  'get_equity_positions',
  'get_equity_quotes',
  'get_equity_fundamentals',
  'get_equity_historicals',
  'get_earnings_calendar',
  'get_earnings_results',
  'get_index_quotes',
  'search',
];

/**
 * The <criteria> block comes from the selected strategy's criteriaPrompt (see
 * lib/confluence/agent/strategies), so the deterministic path and this Claude
 * path apply the SAME rules. Strategies without a criteriaPrompt fall back to
 * a conservative generic screen. The operating rules around the block
 * (read-only, propose-only, output shape) are fixed here regardless.
 */
function buildSystemPrompt(perPositionBudgetUsd: number): string {
  const criteria =
    getStrategy().criteriaPrompt ??
    [
      'No strategy-specific criteria configured. Apply a conservative screen: prefer',
      'reasonably-valued, growing, cash-generative names; skip anything you are unsure about.',
    ].join('\n');
  return [
    'You are a swing-trade analyst combining value investing with technical analysis. You PROPOSE candidate trades; you never execute them.',
    '',
    'HARD RULES (do not violate):',
    '- You may ONLY read data with the Robinhood tools. You have no order tools and must not attempt to place, modify, or cancel any order.',
    '- Output PROPOSALS ONLY. A human reviews and approves every proposal before anything is placed.',
    `- Size each proposal so limit price × quantity stays at or under $${perPositionBudgetUsd}.`,
    '- Every entry is a LIMIT order idea. Include a plain-language thesis and the fundamentals behind it.',
    '',
    '<criteria>',
    criteria,
    '</criteria>',
    '',
    'When done reading, respond with ONLY a JSON object (no prose, no code fences) of the form:',
    '{"proposals":[{"symbol":"AAPL","direction":"buy","thesis":"...","suggestedLimitPrice":182.5,',
    '"suggestedQuantity":5,"suggestedStopPrice":174,"suggestedTargetPrice":205,',
    '"fundamentals":[{"label":"Fwd P/E","value":"26.4"},{"label":"Div yield","value":"0.5%"}]}]}',
    'Use an empty array {"proposals":[]} if nothing qualifies. direction is "buy" or "sell".',
  ].join('\n');
}

interface RawCandidate {
  symbol?: string;
  direction?: string;
  thesis?: string;
  suggestedLimitPrice?: number;
  suggestedQuantity?: number;
  suggestedStopPrice?: number;
  suggestedTargetPrice?: number;
  fundamentals?: FundamentalMetric[];
}

/** Tolerant parse of the model's final text into candidates. */
function parseCandidates(text: string): Candidate[] {
  const cleaned = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1) return [];
  let parsed: { proposals?: RawCandidate[] };
  try {
    parsed = JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    return [];
  }
  const raw = Array.isArray(parsed.proposals) ? parsed.proposals : [];
  const out: Candidate[] = [];
  for (const c of raw) {
    if (!c || typeof c.symbol !== 'string') continue;
    const direction = c.direction === 'sell' ? 'sell' : 'buy';
    if (!(typeof c.suggestedLimitPrice === 'number' && c.suggestedLimitPrice > 0)) continue;
    if (!(typeof c.suggestedQuantity === 'number' && c.suggestedQuantity > 0)) continue;
    out.push({
      symbol: c.symbol.trim().toUpperCase(),
      direction,
      thesis: typeof c.thesis === 'string' && c.thesis.trim() ? c.thesis.trim() : `Agent proposal for ${c.symbol}.`,
      suggestedLimitPrice: c.suggestedLimitPrice,
      suggestedQuantity: c.suggestedQuantity,
      suggestedStopPrice: typeof c.suggestedStopPrice === 'number' ? c.suggestedStopPrice : undefined,
      suggestedTargetPrice: typeof c.suggestedTargetPrice === 'number' ? c.suggestedTargetPrice : undefined,
      fundamentals: Array.isArray(c.fundamentals) ? c.fundamentals : [],
    });
  }
  return out;
}

export interface ClaudeAnalystOptions {
  perPositionBudgetUsd: number;
}

export async function analyzeWithClaude(opts: ClaudeAnalystOptions): Promise<Candidate[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new ConfluenceNotConfigured('ANTHROPIC_API_KEY unset — required for the Claude analyst.');
  }
  // Resolves (and auto-refreshes) the read-only connector's access token, or
  // throws ConfluenceNotConfigured when Robinhood auth isn't set up.
  const rhToken = await getRobinhoodAccessToken();

  const client = new Anthropic({ apiKey });
  const model = process.env.CONFLUENCE_AGENT_MODEL || DEFAULT_MODEL;
  const rhUrl = process.env.ROBINHOOD_MCP_URL || DEFAULT_RH_MCP_URL;
  const universe = getAgentUniverse();

  const stream = client.beta.messages.stream({
    model,
    max_tokens: 16000,
    betas: ['mcp-client-2025-11-20'],
    thinking: { type: 'adaptive' },
    output_config: { effort: 'high' },
    system: buildSystemPrompt(opts.perPositionBudgetUsd),
    mcp_servers: [{ type: 'url', url: rhUrl, name: 'robinhood', authorization_token: rhToken }],
    // Allowlist: disable everything, then re-enable only the read-only tools.
    tools: [
      {
        type: 'mcp_toolset',
        mcp_server_name: 'robinhood',
        default_config: { enabled: false },
        // Per-tool overrides are keyed by tool name; enable only the read-only set.
        configs: Object.fromEntries(ROBINHOOD_READ_ONLY_TOOLS.map((name) => [name, { enabled: true }])),
      },
    ],
    messages: [
      {
        role: 'user',
        content:
          `Analyze these symbols on a swing-trade horizon and propose candidate trades: ${universe.join(', ')}. ` +
          'Read fundamentals, quotes, and current positions/buying power with the Robinhood tools, and pull ' +
          'daily bars with get_equity_historicals (≥200 bars) to compute the technical gate (SMA50/200, RSI14, ATR14). ' +
          'Do not place any orders. Return proposals in the required JSON format.',
      },
    ],
  });

  const final = await stream.finalMessage();
  const text = final.content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('\n');
  return parseCandidates(text);
}
