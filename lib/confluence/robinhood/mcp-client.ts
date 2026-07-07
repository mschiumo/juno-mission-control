/**
 * Minimal server-side MCP (Streamable HTTP) client for the Robinhood Trading MCP.
 *
 * Transport verified live (read tools + review_equity_order dry-run) through the
 * OAuth refresh flow — see docs/CONFLUENCE_GO_LIVE.md. Requires the OAuth setup in
 * lib/confluence/robinhood/oauth.ts + docs/CONFLUENCE_ROBINHOOD_TOKEN.md; when
 * unconfigured, callers throw ConfluenceNotConfigured and the app falls back to
 * paper / the mock provider — nothing here runs by default.
 *
 * Implements the standard flow: initialize → notifications/initialized → tools/call,
 * over a single Streamable-HTTP session, tolerating either application/json or
 * text/event-stream responses. The bearer token is resolved (and auto-refreshed)
 * by the OAuth helper, so this module never touches expiry.
 */

import { getRobinhoodAccessToken } from './oauth';

export { ConfluenceNotConfigured, isRobinhoodConfigured } from './oauth';

const DEFAULT_URL = 'https://agent.robinhood.com/mcp/trading';
// Per-request cap. An unbounded hang here would leave an order stuck `staged`
// with no broker id — bounded failure is strictly better than an open socket.
const REQUEST_TIMEOUT_MS = 30_000;
// Backoff schedule for opt-in retries: 1s, then 3s.
const RETRY_DELAYS_MS = [1_000, 3_000];

/** HTTP-level MCP transport failure, with the status preserved for retry logic. */
export class McpHttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = 'McpHttpError';
  }
}

/**
 * Is this failure worth retrying? Only transport-level trouble qualifies:
 * timeouts / dropped sockets, rate limiting (429), and server errors (5xx).
 * Tool-level errors and 4xx are deterministic — retrying just repeats them.
 */
function isTransientFailure(e: unknown): boolean {
  if (e instanceof McpHttpError) return e.status === 429 || e.status >= 500;
  if (e instanceof Error) {
    // AbortSignal.timeout → TimeoutError (AbortError on older runtimes);
    // undici surfaces network failures as TypeError('fetch failed').
    if (e.name === 'TimeoutError' || e.name === 'AbortError') return true;
    if (e.name === 'TypeError' && e.message.toLowerCase().includes('fetch')) return true;
  }
  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface JsonRpcResponse {
  result?: unknown;
  error?: { code: number; message: string };
}

/** Parse a fetch Response that may be JSON or an SSE stream carrying JSON-RPC. */
async function parseMcpResponse(res: Response): Promise<JsonRpcResponse | null> {
  const contentType = res.headers.get('content-type') || '';
  const body = await res.text();
  if (!body) return null;
  if (contentType.includes('application/json')) {
    return JSON.parse(body) as JsonRpcResponse;
  }
  // text/event-stream: take the last `data:` line that parses as JSON-RPC.
  const dataLines = body
    .split('\n')
    .filter((l) => l.startsWith('data:'))
    .map((l) => l.slice(5).trim())
    .filter(Boolean);
  for (let i = dataLines.length - 1; i >= 0; i--) {
    try {
      return JSON.parse(dataLines[i]) as JsonRpcResponse;
    } catch {
      /* keep scanning */
    }
  }
  return null;
}

/**
 * Call a single Robinhood MCP tool and return its parsed JSON result. Throws
 * ConfluenceNotConfigured when no token is set, or Error on transport/tool failure.
 *
 * `opts.retries` (default 0) opts read-only callers into retrying TRANSIENT
 * failures (timeout / 429 / 5xx) with backoff. The default stays 0 so the live
 * order path never double-submits — an order call that timed out may still
 * have reached the broker.
 */
export async function callRobinhoodTool<T = unknown>(
  toolName: string,
  args: Record<string, unknown>,
  opts?: { retries?: number },
): Promise<T> {
  const retries = opts?.retries ?? 0;
  for (let attempt = 0; ; attempt++) {
    try {
      return await callRobinhoodToolOnce<T>(toolName, args);
    } catch (e) {
      if (attempt >= retries || !isTransientFailure(e)) throw e;
      await sleep(RETRY_DELAYS_MS[Math.min(attempt, RETRY_DELAYS_MS.length - 1)]);
    }
  }
}

/** One initialize → initialized → tools/call round, no retries. */
async function callRobinhoodToolOnce<T>(
  toolName: string,
  args: Record<string, unknown>,
): Promise<T> {
  // Resolves the current access token (refreshing/caching as needed), or throws
  // ConfluenceNotConfigured when nothing is set.
  const token = await getRobinhoodAccessToken();
  const url = process.env.ROBINHOOD_MCP_URL || DEFAULT_URL;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json, text/event-stream',
    Authorization: `Bearer ${token}`,
  };

  const post = (payload: unknown, sessionId?: string) =>
    fetch(url, {
      method: 'POST',
      headers: sessionId ? { ...headers, 'Mcp-Session-Id': sessionId } : headers,
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

  // 1. initialize
  const initRes = await post({
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2025-06-18',
      capabilities: {},
      clientInfo: { name: 'confluence-trading', version: '0.1.0' },
    },
  });
  if (!initRes.ok) {
    throw new McpHttpError(initRes.status, `Robinhood MCP initialize failed: ${initRes.status}`);
  }
  const sessionId = initRes.headers.get('mcp-session-id') || undefined;

  // 2. notifications/initialized (best effort)
  await post({ jsonrpc: '2.0', method: 'notifications/initialized' }, sessionId).catch(() => {});

  // 3. tools/call
  const callRes = await post(
    { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: toolName, arguments: args } },
    sessionId,
  );
  if (!callRes.ok) {
    throw new McpHttpError(callRes.status, `Robinhood MCP tools/call failed: ${callRes.status}`);
  }
  const parsed = await parseMcpResponse(callRes);
  if (!parsed || parsed.error) {
    throw new Error(`Robinhood MCP tool ${toolName} error: ${parsed?.error?.message ?? 'no result'}`);
  }

  // MCP tool results come back as { content: [{ type:'text', text: '<json>' }] }.
  const result = parsed.result as { content?: Array<{ type: string; text?: string }>; isError?: boolean };
  const textPart = result?.content?.find((c) => c.type === 'text')?.text;
  // Tool-level failures set isError with a plain-text message — surface it
  // instead of letting JSON.parse turn it into a confusing SyntaxError.
  if (result?.isError) {
    throw new Error(`Robinhood MCP tool ${toolName} failed: ${textPart ?? 'no error detail'}`);
  }
  if (!textPart) throw new Error(`Robinhood MCP tool ${toolName} returned no text content`);
  return JSON.parse(textPart) as T;
}
