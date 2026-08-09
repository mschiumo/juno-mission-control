/**
 * Server-side error monitoring — Sentry, gated on SENTRY_DSN.
 *
 * With no DSN set (local dev, preview without the env var) every hook here
 * no-ops, so this file is safe to ship ahead of the Sentry account. Set
 * SENTRY_DSN in Vercel to turn it on; no other configuration required.
 */

import * as Sentry from '@sentry/nextjs';

export async function register() {
  if (!process.env.SENTRY_DSN) return;
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.VERCEL_ENV || 'development',
    // Errors are the point; keep performance tracing off until it's wanted.
    tracesSampleRate: 0,
  });
}

export const onRequestError = Sentry.captureRequestError;
