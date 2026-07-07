/**
 * Teller (teller.io) integration — live bank/card balances for the Finances
 * tab. Covers Chase, Capital One, and most major US banks (Affirm and
 * Synchrony are NOT on Teller — those come with the later Plaid integration;
 * until then they stay on sheet/manual/CSV).
 *
 * Go-live steps (all free, ~10 minutes):
 *   1. Sign up at https://teller.io — you get an application id and a
 *      client certificate bundle (teller.zip with certificate.pem +
 *      private_key.pem).
 *   2. Set env vars (locally in .env.local and on Vercel):
 *        TELLER_APP_ID=app_xxxxxxx
 *        TELLER_ENVIRONMENT=development   # sandbox | development | production
 *        TELLER_CERT_B64=$(base64 -i certificate.pem)
 *        TELLER_KEY_B64=$(base64 -i private_key.pem)
 *        FINANCE_TOKEN_SECRET=$(openssl rand -base64 48)
 *   3. Finances tab → "Connect bank" → pick the institution and log in.
 *   The developer tier includes 100 live enrollments — far more than one
 *   owner needs.
 *
 * Auth model (https://teller.io/docs/api/authentication): the Teller
 * Connect browser flow yields an accessToken; server requests use HTTP
 * Basic with that token as username AND must present the client certificate
 * (mTLS) in development/production. Node's https module handles the mTLS
 * part (fetch() can't). Sandbox skips the certificate.
 */

import https from 'https';
import { getRedisClient } from '@/lib/redis';
import { getNowInEST } from '@/lib/date-utils';
import { encryptToken, decryptToken, encryptionConfigured } from './crypto';
import { recordSnapshots } from './history';
import { DebtAccount, BalanceAccount, BalanceKind } from './types';

const enrollmentKey = (userId: string) => `finance:${userId}:teller`;
const debtAccountsKey = (userId: string) => `finance:${userId}:accounts`;
const balanceAccountsKey = (userId: string) => `finance:${userId}:balance-accounts`;

export interface TellerEnrollment {
  tokenEnc: string; // AES-GCM encrypted accessToken
  institutionNames: string[];
  enrolledAt: string;
  lastSyncedAt: string | null;
  lastResult: string | null;
}

export function tellerConfigured(): boolean {
  const env = process.env.TELLER_ENVIRONMENT || 'sandbox';
  const hasCert = !!process.env.TELLER_CERT_B64 && !!process.env.TELLER_KEY_B64;
  return !!process.env.TELLER_APP_ID && encryptionConfigured() && (env === 'sandbox' || hasCert);
}

/** Public config for the Teller Connect browser widget. */
export function tellerConnectConfig(): { applicationId: string; environment: string } | null {
  if (!tellerConfigured()) return null;
  return {
    applicationId: process.env.TELLER_APP_ID!,
    environment: process.env.TELLER_ENVIRONMENT || 'sandbox',
  };
}

/** GET api.teller.io with Basic auth (token as username) + mTLS cert. */
function tellerGet<T>(path: string, accessToken: string): Promise<T> {
  const environment = process.env.TELLER_ENVIRONMENT || 'sandbox';
  const options: https.RequestOptions = {
    hostname: 'api.teller.io',
    path,
    method: 'GET',
    auth: `${accessToken}:`,
    headers: { Accept: 'application/json' },
    timeout: 15_000,
  };
  if (environment !== 'sandbox') {
    options.cert = Buffer.from(process.env.TELLER_CERT_B64!, 'base64');
    options.key = Buffer.from(process.env.TELLER_KEY_B64!, 'base64');
  }
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => {
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve(JSON.parse(body));
          } catch {
            reject(new Error(`Teller returned non-JSON for ${path}`));
          }
        } else {
          reject(new Error(`Teller ${path} returned ${res.statusCode}: ${body.slice(0, 200)}`));
        }
      });
    });
    req.on('timeout', () => req.destroy(new Error('Teller request timed out')));
    req.on('error', reject);
    req.end();
  });
}

interface TellerAccount {
  id: string;
  name: string;
  type: 'depository' | 'credit';
  subtype: string; // checking | savings | money_market | cd | credit_card | …
  last_four: string;
  institution: { id: string; name: string };
}

interface TellerBalance {
  ledger: string;
  available: string;
}

function classifyDepository(subtype: string): BalanceKind {
  if (/saving|money_market|cd/i.test(subtype)) return 'savings';
  if (/checking/i.test(subtype)) return 'checking';
  return 'other';
}

async function loadJsonArray<T>(key: string): Promise<T[]> {
  const redis = await getRedisClient();
  const raw = await redis.get(key);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function loadEnrollment(userId: string): Promise<TellerEnrollment | null> {
  const redis = await getRedisClient();
  const raw = await redis.get(enrollmentKey(userId));
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function saveEnrollment(
  userId: string,
  accessToken: string,
  institutionNames: string[],
): Promise<TellerEnrollment> {
  const enrollment: TellerEnrollment = {
    tokenEnc: encryptToken(accessToken),
    institutionNames,
    enrolledAt: getNowInEST(),
    lastSyncedAt: null,
    lastResult: null,
  };
  const redis = await getRedisClient();
  await redis.set(enrollmentKey(userId), JSON.stringify(enrollment));
  return enrollment;
}

export async function removeEnrollment(userId: string): Promise<void> {
  const redis = await getRedisClient();
  await redis.del(enrollmentKey(userId));
  // Teller-sourced accounts keep their last balances but become manual.
  const now = getNowInEST();
  const debts = await loadJsonArray<DebtAccount>(debtAccountsKey(userId));
  await redis.set(
    debtAccountsKey(userId),
    JSON.stringify(debts.map((a) => (a.source === 'teller' ? { ...a, source: 'manual' as const, updatedAt: now } : a))),
  );
  const balances = await loadJsonArray<BalanceAccount>(balanceAccountsKey(userId));
  await redis.set(
    balanceAccountsKey(userId),
    JSON.stringify(balances.map((a) => (a.source === 'teller' ? { ...a, source: 'manual' as const, updatedAt: now } : a))),
  );
}

/**
 * Pull accounts + balances from Teller and upsert into the two stores:
 * credit accounts → DebtAccount (balance = ledger; APR/min payment/due day
 * stay user-editable — Teller doesn't return card terms), depository
 * accounts → BalanceAccount. Matched by externalId (Teller account id).
 */
export async function syncTellerAccounts(userId: string): Promise<
  { synced: number; debts: number; assets: number } | { error: string }
> {
  const enrollment = await loadEnrollment(userId);
  if (!enrollment) return { error: 'No Teller enrollment — connect a bank first' };

  let token: string;
  try {
    token = decryptToken(enrollment.tokenEnc);
  } catch {
    return { error: 'Stored Teller token could not be decrypted (FINANCE_TOKEN_SECRET changed?) — reconnect the bank' };
  }

  let accounts: TellerAccount[];
  try {
    accounts = await tellerGet<TellerAccount[]>('/accounts', token);
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Teller /accounts failed' };
  }

  const now = getNowInEST();
  const debts = await loadJsonArray<DebtAccount>(debtAccountsKey(userId));
  const balances = await loadJsonArray<BalanceAccount>(balanceAccountsKey(userId));
  let debtCount = 0;
  let assetCount = 0;

  for (const acct of accounts) {
    let ledger: number;
    try {
      const bal = await tellerGet<TellerBalance>(`/accounts/${acct.id}/balances`, token);
      ledger = Math.abs(Number(bal.ledger));
      if (!Number.isFinite(ledger)) continue;
      ledger = Math.round(ledger * 100) / 100;
    } catch {
      continue; // skip accounts whose balance endpoint fails; sync the rest
    }
    const displayName = `${acct.institution.name} ${acct.name} ••${acct.last_four}`;

    if (acct.type === 'credit') {
      const idx = debts.findIndex((a) => a.externalId === acct.id);
      if (idx !== -1) {
        debts[idx] = { ...debts[idx], balance: ledger, source: 'teller', updatedAt: now };
      } else {
        debts.push({
          id: `debt_teller_${acct.id}`,
          name: displayName,
          type: 'credit-card',
          balance: ledger,
          apr: 0, // fill in manually — Teller doesn't expose card terms
          minPayment: 0,
          dueDay: 1,
          source: 'teller',
          externalId: acct.id,
          createdAt: now,
          updatedAt: now,
        });
      }
      debtCount++;
    } else {
      const idx = balances.findIndex((a) => a.externalId === acct.id);
      const kind = classifyDepository(acct.subtype);
      if (idx !== -1) {
        balances[idx] = { ...balances[idx], balance: ledger, source: 'teller', updatedAt: now };
      } else {
        balances.push({
          id: `bal_teller_${acct.id}`,
          name: displayName,
          kind,
          balance: ledger,
          institution: acct.institution.name,
          source: 'teller',
          externalId: acct.id,
          createdAt: now,
          updatedAt: now,
        });
      }
      assetCount++;
    }
  }

  const redis = await getRedisClient();
  await redis.set(debtAccountsKey(userId), JSON.stringify(debts));
  await redis.set(balanceAccountsKey(userId), JSON.stringify(balances));
  await recordSnapshots(userId);

  const summary = `Synced ${accounts.length} accounts (${debtCount} debt, ${assetCount} asset)`;
  await redis.set(
    enrollmentKey(userId),
    JSON.stringify({ ...enrollment, lastSyncedAt: now, lastResult: summary }),
  );

  return { synced: accounts.length, debts: debtCount, assets: assetCount };
}
