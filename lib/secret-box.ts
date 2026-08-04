/**
 * secret-box — AES-256-GCM encryption for small secrets at rest.
 *
 * Built for the SnapTrade userSecret (lib/db/broker-connections.ts) but not
 * specific to it. The key comes from BROKER_SECRET_ENC_KEY: 32 random bytes,
 * base64-encoded (`openssl rand -base64 32`).
 *
 * Sealed values are self-describing — `enc:v1:<iv>:<authTag>:<ciphertext>`,
 * each part base64 — which gives two properties the migration relies on:
 *   - a value that lacks the prefix is legacy plaintext and passes through
 *     openSecret() untouched, so pre-encryption records keep working and get
 *     sealed the next time they're saved;
 *   - the `v1` version tag leaves room for key rotation later (seal with v2,
 *     open both) without re-migrating.
 *
 * Without the env key, sealSecret() is a pass-through: local dev (which has no
 * SnapTrade credentials anyway) keeps working, and production is encrypted the
 * moment the key is set. openSecret() on a sealed value without the key throws
 * — that means the key was lost or removed, and silently returning ciphertext
 * would only surface later as a baffling SnapTrade auth failure.
 */

import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const PREFIX = 'enc:v1:';
const KEY_ENV = 'BROKER_SECRET_ENC_KEY';

function loadKey(): Buffer | null {
  const raw = process.env[KEY_ENV];
  if (!raw) return null;
  const key = Buffer.from(raw, 'base64');
  if (key.length !== 32) {
    throw new Error(
      `${KEY_ENV} must decode to 32 bytes (generate with: openssl rand -base64 32)`
    );
  }
  return key;
}

export function isSealed(value: string): boolean {
  return value.startsWith(PREFIX);
}

/** Encrypt a secret for storage. Pass-through when no key is configured. */
export function sealSecret(plaintext: string): string {
  if (isSealed(plaintext)) return plaintext; // never double-encrypt
  const key = loadKey();
  if (!key) return plaintext;
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString('base64')}:${tag.toString('base64')}:${ciphertext.toString('base64')}`;
}

/** Decrypt a stored secret. Legacy plaintext (no prefix) is returned as-is. */
export function openSecret(stored: string): string {
  if (!isSealed(stored)) return stored;
  const key = loadKey();
  if (!key) {
    throw new Error(`Found an encrypted secret but ${KEY_ENV} is not set`);
  }
  const parts = stored.slice(PREFIX.length).split(':');
  if (parts.length !== 3) {
    throw new Error('Malformed sealed secret');
  }
  const [iv, tag, ciphertext] = parts.map(p => Buffer.from(p, 'base64'));
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  // Throws on a wrong key or tampered ciphertext (GCM auth failure).
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}
