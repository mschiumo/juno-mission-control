# Finances — live bank sync via Plaid

The Finances tab tracks credit lines by hand out of the box. Connecting Plaid
makes balances, APRs, statement minimums, and due dates update themselves.

Everything here is **owner-only** and **env-gated**: with no Plaid keys set the
feature is dormant, the connect button is hidden, and the Plaid routes answer
`503`. Manual entry and editing work identically either way.

## Design principles

- **Manual always wins.** `name` and the planned `monthlyPayment` belong to the
  user and are never rewritten by a sync. `balance` and `apr` come from Plaid
  *unless* the user edits them, which pins that field — the nightly cron will not
  silently revert a correction. Pins are visible (a small pin icon) and
  reversible ("resume syncing").
- **Tokens are credentials.** Plaid access tokens are encrypted at rest with
  AES-256-GCM (`lib/finances/crypto.ts`) and never appear in an API response or a
  log line. Routes return a token-free projection of each connection.
- **One bank failing is not an outage.** `syncAllItems` isolates each
  institution; a failure marks just that connection and leaves every other
  balance intact at its last known value.
- **Never invent a number.** When Plaid reports no APR the previous value stands
  rather than being zeroed; when it reports several rates the *purchase* APR is
  used, never an average.

## What Plaid can and cannot cover

| Account | Live sync | Notes |
| --- | --- | --- |
| Capital One (Quicksilver + Venture) | Yes | One Item covers both cards |
| Chase | Yes | OAuth bank — see `PLAID_REDIRECT_URI` below |
| Synchrony (Amazon, Venmo card) | Yes | Not available via Teller; Plaid only |
| Affirm | Yes | Reported as a credit line when supported |
| **Apple Card** | **No** | No aggregator supports it. FinanceKit is iOS-native only, so this one stays manual — edit the balance monthly. |

## Setup

1. **Create a Plaid team** at <https://dashboard.plaid.com> and enable the
   **Liabilities** product. New US teams get a free Trial plan (10 Production
   Items, Liabilities included). One Item = one institution login, so the roster
   above uses 4–5 of the 10.
2. **Set env vars** in Vercel (Production *and* Preview):

   | Variable | Value |
   | --- | --- |
   | `PLAID_CLIENT_ID` | from the Plaid dashboard |
   | `PLAID_SECRET` | the secret for the environment you target |
   | `PLAID_ENV` | `sandbox` (default) or `production` |
   | `FINANCE_TOKEN_SECRET` | any long random string — `openssl rand -base64 48` |

   `FINANCE_TOKEN_SECRET` encrypts stored tokens. Rotating it invalidates them;
   the fix is to reconnect each bank (no data is lost).
3. **Deploy**, open **Finances → Connect bank**, and complete Plaid Link.
4. Optional — **`PLAID_REDIRECT_URI`**: set to
   `https://confluencetrading.app/?tab=finances` and register the identical URI
   in the Plaid dashboard. Only needed if an OAuth bank (Chase, Capital One)
   fails because its popup was blocked; Plaid then uses a redirect instead.

While `PLAID_ENV=sandbox` the tab shows a **SANDBOX** chip — connected data is
Plaid's test data, not real accounts.

## Operating it

- **Refresh** pulls every linked bank on demand. Liabilities bills as a monthly
  per-Item subscription, not per call, so refreshing often costs nothing extra; a
  10-second throttle only guards against a stuck client.
- **Nightly cron** `/api/cron-jobs/finances-refresh` runs at 09:00 UTC
  (`vercel.json`), so balances and the history chart stay current untouched.
  Gated by `CRON_SECRET`.
- **Reconnect** appears when a bank login expires (`ITEM_LOGIN_REQUIRED`). It
  runs Plaid Link in *update mode*, which re-authenticates the existing Item
  rather than creating a second billed one.
- **Disconnect** revokes the token at Plaid — which is what actually stops the
  monthly charge — then converts those accounts back to manual rows, keeping
  their balances and history. If Plaid rejects the revoke the UI says so and asks
  you to remove the Item from the Plaid dashboard.

## Data model

Redis keys, namespaced `finances:` (plural) to stay clear of the older
unmerged `finance:` prototype:

| Key | Contents |
| --- | --- |
| `finances:{userId}:credit-cards` | account array, including sync metadata and pins |
| `finances:{userId}:credit-history` | one balance snapshot per EST day |
| `finances:{userId}:plaid-items` | connected institutions + encrypted tokens |

Pure, unit-tested logic lives in `lib/finances/{credit-cards,merge,plaid}.ts`;
`test/finances-plaid-sync.test.ts` and `test/finances-plaid-client.test.ts` cover
the merge rules, override lifecycle, and Plaid response mapping.

## Notes

- The CSP in `next.config.ts` allows `https://cdn.plaid.com` in **both**
  `script-src` and `frame-src`. Link renders its bank login in an iframe, and
  without the `frame-src` entry the modal is silently blank in production.
- A newly linked card is matched to an existing manual row only on a strong
  signal (matching last four, or one name clearly containing the other) and never
  when two rows tie — so a bad merge can't overwrite an unrelated card. Anything
  unmatched is added as a new row; delete the manual duplicate if one appears.
