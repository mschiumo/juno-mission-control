/**
 * Minimal server-side MCP (Streamable HTTP) client for the Robinhood Trading MCP.
 *
 * ⚠️ TRANSPORT NOT YET VERIFIED END-TO-END. The in-session Robinhood MCP that was
 * used to verify connectivity is authenticated by the Claude harness, which is
 * NOT the same as the deployed app being able to reach Robinhood. To use this in
 * the app you must configure the OAuth flow (see lib/confluence/robinhood/oauth.ts
 * + docs/CONFLUENCE_ROBINHOOD_TOKEN.md) and confirm the auth handshake. Until
 * then callers throw ConfluenceNotConfigured and the app falls back to paper /
 * the mock provider — nothing here runs by default.
 *
 * Implements the standard flow: initialize → notifications/initialized → tools/call,
 * over a single Streamable-HTTP session, tolerating either application/json or
 * text/event-stream responses. The bearer token is resolved (and auto-refreshed)
 * by the OAuth helper, so this module never touches expiry.
 */

import { getRobinhoodAccessToken } from './oauth';

export { ConfluenceNotConfigured, isRobinhoodConfigured } from './oauth';

const DEFAULT_URL = 'https://agent.robinhood.com/mcp/trading';

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
 */
export async function callRobinhoodTool<T = unknown>(
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
  if (!initRes.ok) throw new Error(`Robinhood MCP initialize failed: ${initRes.status}`);
  const sessionId = initRes.headers.get('mcp-session-id') || undefined;

  // 2. notifications/initialized (best effort)
  await post({ jsonrpc: '2.0', method: 'notifications/initialized' }, sessionId).catch(() => {});

  // 3. tools/call
  const callRes = await post(
    { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: toolName, arguments: args } },
    sessionId,
  );
  if (!callRes.ok) throw new Error(`Robinhood MCP tools/call failed: ${callRes.status}`);
  const parsed = await parseMcpResponse(callRes);
  if (!parsed || parsed.error) {
    throw new Error(`Robinhood MCP tool ${toolName} error: ${parsed?.error?.message ?? 'no result'}`);
  }

  // MCP tool results come back as { content: [{ type:'text', text: '<json>' }] }.
  const result = parsed.result as { content?: Array<{ type: string; text?: string }> };
  const textPart = result?.content?.find((c) => c.type === 'text')?.text;
  if (!textPart) throw new Error(`Robinhood MCP tool ${toolName} returned no text content`);
  return JSON.parse(textPart) as T;
}
