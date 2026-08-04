import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { randomBytes } from 'crypto';
import { sealSecret, openSecret, isSealed } from '../lib/secret-box';

const KEY_ENV = 'BROKER_SECRET_ENC_KEY';
const KEY = randomBytes(32).toString('base64');
const SECRET = 'snaptrade-user-secret-3c1f0a';

const originalKey = process.env[KEY_ENV];
afterAll(() => {
  if (originalKey === undefined) delete process.env[KEY_ENV];
  else process.env[KEY_ENV] = originalKey;
});

describe('secret-box with a key configured', () => {
  beforeEach(() => {
    process.env[KEY_ENV] = KEY;
  });

  it('round-trips a secret', () => {
    const sealed = sealSecret(SECRET);
    expect(sealed).not.toBe(SECRET);
    expect(isSealed(sealed)).toBe(true);
    expect(sealed.startsWith('enc:v1:')).toBe(true);
    expect(openSecret(sealed)).toBe(SECRET);
  });

  it('produces a distinct ciphertext per seal (fresh IV)', () => {
    expect(sealSecret(SECRET)).not.toBe(sealSecret(SECRET));
  });

  it('never double-encrypts an already-sealed value', () => {
    const sealed = sealSecret(SECRET);
    expect(sealSecret(sealed)).toBe(sealed);
    expect(openSecret(sealed)).toBe(SECRET);
  });

  it('passes legacy plaintext through openSecret untouched', () => {
    // Pre-encryption records have no prefix — they must keep working.
    expect(openSecret(SECRET)).toBe(SECRET);
  });

  it('throws on tampered ciphertext (GCM auth)', () => {
    const sealed = sealSecret(SECRET);
    const parts = sealed.split(':');
    const ct = Buffer.from(parts[4], 'base64');
    ct[0] ^= 0xff;
    parts[4] = ct.toString('base64');
    expect(() => openSecret(parts.join(':'))).toThrow();
  });

  it('throws when opened with a different key', () => {
    const sealed = sealSecret(SECRET);
    process.env[KEY_ENV] = randomBytes(32).toString('base64');
    expect(() => openSecret(sealed)).toThrow();
  });

  it('throws on a malformed sealed value', () => {
    expect(() => openSecret('enc:v1:not-enough-parts')).toThrow('Malformed');
  });

  it('rejects a key of the wrong length', () => {
    process.env[KEY_ENV] = randomBytes(16).toString('base64');
    expect(() => sealSecret(SECRET)).toThrow('32 bytes');
  });
});

describe('secret-box without a key', () => {
  beforeEach(() => {
    delete process.env[KEY_ENV];
  });

  it('sealSecret is a pass-through (local dev)', () => {
    expect(sealSecret(SECRET)).toBe(SECRET);
  });

  it('openSecret passes plaintext through', () => {
    expect(openSecret(SECRET)).toBe(SECRET);
  });

  it('openSecret refuses a sealed value — loud failure over silent ciphertext', () => {
    process.env[KEY_ENV] = KEY;
    const sealed = sealSecret(SECRET);
    delete process.env[KEY_ENV];
    expect(() => openSecret(sealed)).toThrow(KEY_ENV);
  });
});
