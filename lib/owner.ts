/**
 * Single source of truth for the app owner / root user.
 *
 * The Goals tab (and other owner-only surfaces) gate on this. It lives in its own
 * pure module so both client components (app/page.tsx) and server code
 * (lib/auth-session.ts, API routes, crons) can import it without duplicating the
 * literal. The value is already public in the client bundle today, so a shared
 * constant is preferable to an env var (no per-environment variance, no wiring).
 */
export const OWNER_EMAIL = 'mschiumo18@gmail.com';

/** Case-insensitive check that an email belongs to the owner. */
export function isOwnerEmail(email?: string | null): boolean {
  return !!email && email.toLowerCase() === OWNER_EMAIL.toLowerCase();
}
