/**
 * AES-256-GCM encryption for aggregator credentials at rest.
 *
 * Bank access tokens (Teller enrollments, later Plaid) are credentials to
 * the owner's real accounts — they must not sit in Redis as plaintext.
 * Key is derived from the FINANCE_TOKEN_SECRET env var (set any long random
 * string, e.g. `openssl rand -base64 48`). Rotating the secret invalidates
 * stored tokens (user just re-connects).
 *
 * Format: "v1:<iv b64>:<authTag b64>:<ciphertext b64>"
 */

import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';

function key(): Buffer {
  const secret = process.env.FINANCE_TOKEN_SECRET;
  if (!secret) {
    throw new Error('FINANCE_TOKEN_SECRET is not set — required to store aggregator tokens');
  }
  return createHash('sha256').update(secret).digest();
}

export function encryptionConfigured(): boolean {
  return !!process.env.FINANCE_TOKEN_SECRET;
}

export function encryptToken(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString('base64')}:${tag.toString('base64')}:${encrypted.toString('base64')}`;
}

export function decryptToken(stored: string): string {
  const [version, ivB64, tagB64, dataB64] = stored.split(':');
  if (version !== 'v1' || !ivB64 || !tagB64 || !dataB64) {
    throw new Error('Unrecognized encrypted token format');
  }
  const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64')), decipher.final()]).toString('utf8');
}
