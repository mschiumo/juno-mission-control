/**
 * User type definitions for multi-user support
 */

export interface User {
  id: string;
  email: string;
  name?: string | null;
  image?: string | null;
}

export interface SessionUser {
  id: string;
  email?: string | null;
  name?: string | null;
  image?: string | null;
}

/**
 * Get a unique user ID from email
 * This creates a stable ID from the user's email address
 */
export function getUserIdFromEmail(email: string | null | undefined): string {
  if (!email) return 'anonymous';
  // Use the email as the user ID (normalized to lowercase)
  return email.toLowerCase().trim();
}
