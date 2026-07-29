/**
 * Plaid REST client — server-side only.
 *
 * Talks to Plaid's HTTP API directly with fetch rather than pulling in the
 * `plaid` npm SDK: we need four endpoints, and the SDK would add a dependency
 * plus its own axios stack to every serverless bundle.
 *
 * SETUP (owner):
 *  1. Create a team at https://dashboard.plaid.com and enable the **Liabilities**
 *     product. New US teams get a free Trial plan (10 Production Items).
 *  2. Set these env vars in Vercel (Production + Preview):
 *       PLAID_CLIENT_ID      — from the dashboard
 *       PLAID_SECRET         — the secret for the environment you target
 *       PLAID_ENV            — "sandbox" (default) or "production"
 *       FINANCE_TOKEN_SECRET — any long random string; encrypts access tokens
 *                              at rest (`openssl rand -base64 48`)
 *  3. Optional: PLAID_REDIRECT_URI — set to
 *     https://confluencetrading.app/?tab=finances and register the same URI in
 *     the Plaid dashboard. Only needed if an OAuth bank (Chase, Capital One)
 *     fails to connect because its popup was blocked; Plaid uses a redirect
 *     instead when this is configured.
 *
 * Until PLAID_CLIENT_ID/PLAID_SECRET/FINANCE_TOKEN_SECRET are present the whole
 * feature stays dormant: `plaidConfigured()` is false, the UI hides the connect
 * button, and every Plaid route answers 503 instead of throwing.
 */

import { encryptionConfigured } from './crypto';
import type { PlaidAccountSnapshot } from './credit-cards';

type PlaidEnvironment = 'sandbox' | 'production';

function environment(): PlaidEnvironment {
  return process.env.PLAID_ENV === 'production' ? 'production' : 'sandbox';
}

function baseUrl(): string {
  return `https://${environment()}.plaid.com`;
}

export function plaidConfigured(): boolean {
  return !!(process.env.PLAID_CLIENT_ID && process.env.PLAID_SECRET && encryptionConfigured());
}

/** True once real money is on the line — used to label the UI honestly. */
export function isProductionEnvironment(): boolean {
  return environment() === 'production';
}

export class PlaidError extends Error {
  readonly errorCode: string;
  readonly errorType: string;
  readonly displayMessage: string | null;
  readonly httpStatus: number;

  constructor(args: {
    message: string;
    errorCode?: string;
    errorType?: string;
    displayMessage?: string | null;
    httpStatus: number;
  }) {
    super(args.message);
    this.name = 'PlaidError';
    this.errorCode = args.errorCode ?? 'UNKNOWN';
    this.errorType = args.errorType ?? 'UNKNOWN';
    this.displayMessage = args.displayMessage ?? null;
    this.httpStatus = args.httpStatus;
  }

  /**
   * The connection needs the user to log in again through Link. Treated as a
   * distinct state because it is the one failure the owner can actually fix,
   * and it must not look like a transient error.
   */
  get isReauthRequired(): boolean {
    return (
      this.errorCode === 'ITEM_LOGIN_REQUIRED' ||
      this.errorCode === 'ITEM_LOCKED' ||
      this.errorCode === 'PENDING_EXPIRATION' ||
      this.errorCode === 'INVALID_CREDENTIALS' ||
      this.errorCode === 'INVALID_MFA'
    );
  }

  /** Worth retrying later on the nightly cron rather than surfacing loudly. */
  get isTransient(): boolean {
    return (
      this.errorCode === 'PRODUCT_NOT_READY' ||
      this.errorCode === 'RATE_LIMIT_EXCEEDED' ||
      this.errorType === 'API_ERROR' ||
      this.httpStatus >= 500
    );
  }

  /** Message safe to show the owner — never includes credentials or raw bodies. */
  get userMessage(): string {
    if (this.isReauthRequired) return 'Bank login expired — reconnect to resume syncing.';
    if (this.errorCode === 'RATE_LIMIT_EXCEEDED') return 'Plaid rate limit hit — try again in a few minutes.';
    if (this.errorCode === 'PRODUCT_NOT_READY') return 'Plaid is still preparing this account — try again shortly.';
    return this.displayMessage || 'Could not reach this bank. Plaid will retry tonight.';
  }
}

async function plaidPost<T>(path: string, body: Record<string, unknown>): Promise<T> {
  if (!plaidConfigured()) {
    throw new PlaidError({ message: 'Plaid is not configured', errorCode: 'NOT_CONFIGURED', httpStatus: 503 });
  }

  let response: Response;
  try {
    response = await fetch(`${baseUrl()}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Credentials go in headers, not the JSON body, so an accidental body
        // log can never leak the secret.
        'PLAID-CLIENT-ID': process.env.PLAID_CLIENT_ID!,
        'PLAID-SECRET': process.env.PLAID_SECRET!,
      },
      body: JSON.stringify(body),
      cache: 'no-store',
    });
  } catch (cause) {
    throw new PlaidError({
      message: `Network failure calling Plaid ${path}: ${cause instanceof Error ? cause.message : 'unknown'}`,
      errorType: 'API_ERROR',
      httpStatus: 502,
    });
  }

  const text = await response.text();
  let payload: Record<string, unknown> = {};
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    // Non-JSON body (gateway HTML, etc.) — fall through to the status check.
  }

  if (!response.ok) {
    throw new PlaidError({
      message: `Plaid ${path} failed (${response.status}): ${String(payload.error_code ?? 'unknown')}`,
      errorCode: typeof payload.error_code === 'string' ? payload.error_code : undefined,
      errorType: typeof payload.error_type === 'string' ? payload.error_type : undefined,
      displayMessage: typeof payload.display_message === 'string' ? payload.display_message : null,
      httpStatus: response.status,
    });
  }

  return payload as T;
}

/**
 * Mint a Link token. Passing `accessToken` produces an *update mode* token,
 * which re-authenticates an existing Item instead of creating a new one — the
 * fix for ITEM_LOGIN_REQUIRED, and important for billing: a fresh Link run would
 * create a second Item for the same bank and consume another Trial slot.
 */
export async function createLinkToken(
  clientUserId: string,
  opts: { accessToken?: string } = {},
): Promise<{ linkToken: string; expiration: string }> {
  const body: Record<string, unknown> = {
    client_name: 'Confluence Trading', // Plaid caps this at 30 characters
    language: 'en',
    country_codes: ['US'],
    user: { client_user_id: clientUserId },
  };

  if (opts.accessToken) {
    // Update mode: products must be omitted when re-authing an existing Item.
    body.access_token = opts.accessToken;
  } else {
    body.products = ['liabilities'];
  }

  if (process.env.PLAID_REDIRECT_URI) {
    body.redirect_uri = process.env.PLAID_REDIRECT_URI;
  }

  const data = await plaidPost<{ link_token: string; expiration: string }>('/link/token/create', body);
  return { linkToken: data.link_token, expiration: data.expiration };
}

export async function exchangePublicToken(
  publicToken: string,
): Promise<{ accessToken: string; itemId: string }> {
  const data = await plaidPost<{ access_token: string; item_id: string }>(
    '/item/public_token/exchange',
    { public_token: publicToken },
  );
  return { accessToken: data.access_token, itemId: data.item_id };
}

/**
 * Stop Plaid billing for an Item and revoke the token. Called on disconnect —
 * dropping our stored token alone would leave the Item alive and still charged.
 */
export async function removeRemoteItem(accessToken: string): Promise<void> {
  await plaidPost('/item/remove', { access_token: accessToken });
}

/* ---------- /liabilities/get response shapes (only fields we consume) ---------- */

interface PlaidBalances {
  available: number | null;
  current: number | null;
  limit: number | null;
  iso_currency_code: string | null;
}

interface PlaidApiAccount {
  account_id: string;
  name: string;
  official_name: string | null;
  mask: string | null;
  type: string;
  subtype: string | null;
  balances: PlaidBalances;
}

interface PlaidCreditLiability {
  account_id: string;
  aprs?: Array<{ apr_percentage: number | null; apr_type: string | null }> | null;
  minimum_payment_amount: number | null;
  last_statement_balance: number | null;
  next_payment_due_date: string | null;
}

interface LiabilitiesResponse {
  accounts?: PlaidApiAccount[];
  liabilities?: { credit?: PlaidCreditLiability[] | null } | null;
}

/**
 * The APR a cardholder actually cares about is the purchase APR; cards also
 * report cash-advance, balance-transfer, and promotional rates. Fall back to a
 * single reported rate when the type is unlabelled, but never average them —
 * that would invent a number no statement shows.
 */
export function selectPurchaseApr(
  aprs: Array<{ apr_percentage: number | null; apr_type: string | null }> | null | undefined,
): number | undefined {
  if (!aprs?.length) return undefined;
  const usable = aprs.filter((a) => typeof a.apr_percentage === 'number' && Number.isFinite(a.apr_percentage));
  if (!usable.length) return undefined;

  const purchase = usable.find((a) => a.apr_type === 'purchase_apr');
  if (purchase) return purchase.apr_percentage!;

  const special = usable.find((a) => a.apr_type === 'special');
  if (special) return special.apr_percentage!;

  return usable.length === 1 ? usable[0].apr_percentage! : undefined;
}

/** Plaid may return a full timestamp; the tab only ever displays the date. */
function toDateOnly(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(value);
  return match ? match[1] : undefined;
}

function numberOrUndefined(value: number | null | undefined): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

/**
 * Fetch every credit line on an Item and flatten it into snapshots.
 *
 * Accounts are included when Plaid types them `credit`, even if the Item has no
 * matching `liabilities.credit` entry — some issuers return the balance but no
 * card terms, and a balance-only sync is still worth having.
 */
export async function fetchCreditSnapshots(
  accessToken: string,
  context: { itemId: string; institutionName: string },
): Promise<PlaidAccountSnapshot[]> {
  const data = await plaidPost<LiabilitiesResponse>('/liabilities/get', { access_token: accessToken });

  const creditByAccountId = new Map<string, PlaidCreditLiability>();
  for (const credit of data.liabilities?.credit ?? []) {
    if (credit?.account_id) creditByAccountId.set(credit.account_id, credit);
  }

  const snapshots: PlaidAccountSnapshot[] = [];
  for (const account of data.accounts ?? []) {
    if (account.type !== 'credit') continue;

    const balance = numberOrUndefined(account.balances?.current);
    if (balance === undefined) continue; // nothing meaningful to record

    const credit = creditByAccountId.get(account.account_id);
    snapshots.push({
      plaidItemId: context.itemId,
      plaidAccountId: account.account_id,
      institutionName: context.institutionName,
      name: account.official_name || account.name || 'Credit line',
      mask: account.mask ?? undefined,
      balance,
      apr: selectPurchaseApr(credit?.aprs),
      creditLimit: numberOrUndefined(account.balances?.limit),
      minPayment: numberOrUndefined(credit?.minimum_payment_amount),
      nextDueDate: toDateOnly(credit?.next_payment_due_date),
      lastStatementBalance: numberOrUndefined(credit?.last_statement_balance),
    });
  }

  return snapshots;
}
