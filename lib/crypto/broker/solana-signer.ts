import { createPrivateKey, createPublicKey, sign as edSign } from 'crypto';

/**
 * Minimal Solana transaction signing with zero new dependencies, using Node's
 * built-in ed25519 support. The trading wallet secret comes from
 * CRYPTO_WALLET_SECRET_KEY — either a base58-encoded 64-byte secret key
 * (Phantom/solana-keygen export) or a JSON byte array.
 *
 * Security posture (per bot key-management best practice): this must be a
 * DEDICATED hot wallet holding only what the bot may lose — never a main wallet.
 *
 * (BigInt via constructor calls, not literals — tsconfig targets ES2017.)
 */

const B58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

const ZERO = BigInt(0);
const EIGHT = BigInt(8);
const FIFTY_EIGHT = BigInt(58);
const BYTE_MASK = BigInt(0xff);

export function base58Decode(input: string): Uint8Array {
  let value = ZERO;
  for (const char of input) {
    const idx = B58_ALPHABET.indexOf(char);
    if (idx < 0) throw new Error('Invalid base58 character');
    value = value * FIFTY_EIGHT + BigInt(idx);
  }
  const bytes: number[] = [];
  while (value > ZERO) {
    bytes.unshift(Number(value & BYTE_MASK));
    value >>= EIGHT;
  }
  // Leading '1's encode leading zero bytes.
  for (const char of input) {
    if (char !== '1') break;
    bytes.unshift(0);
  }
  return Uint8Array.from(bytes);
}

export function base58Encode(bytes: Uint8Array): string {
  let value = ZERO;
  for (const byte of bytes) value = (value << EIGHT) + BigInt(byte);
  let out = '';
  while (value > ZERO) {
    out = B58_ALPHABET[Number(value % FIFTY_EIGHT)] + out;
    value /= FIFTY_EIGHT;
  }
  for (const byte of bytes) {
    if (byte !== 0) break;
    out = '1' + out;
  }
  return out;
}

function loadSeed(): Uint8Array {
  const raw = process.env.CRYPTO_WALLET_SECRET_KEY;
  if (!raw) throw new Error('CRYPTO_WALLET_SECRET_KEY is not configured');
  let secret: Uint8Array;
  if (raw.trim().startsWith('[')) {
    secret = Uint8Array.from(JSON.parse(raw) as number[]);
  } else {
    secret = base58Decode(raw.trim());
  }
  // 64-byte secret = 32-byte seed + 32-byte pubkey; 32-byte input is a bare seed.
  if (secret.length !== 64 && secret.length !== 32) {
    throw new Error(`Unexpected secret key length ${secret.length}`);
  }
  return secret.slice(0, 32);
}

/** PKCS8 DER prefix for a raw ed25519 seed (RFC 8410). */
const PKCS8_PREFIX = Buffer.from('302e020100300506032b657004220420', 'hex');

function privateKeyObject() {
  const seed = loadSeed();
  return createPrivateKey({
    key: Buffer.concat([PKCS8_PREFIX, Buffer.from(seed)]),
    format: 'der',
    type: 'pkcs8',
  });
}

/** Base58 public key (wallet address) derived from the configured secret. */
export function walletPublicKey(): string {
  const pub = createPublicKey(privateKeyObject());
  const spki = pub.export({ format: 'der', type: 'spki' });
  // Raw 32-byte ed25519 public key is the tail of the SPKI DER encoding.
  return base58Encode(Uint8Array.from(spki.subarray(spki.length - 32)));
}

/**
 * Sign a serialized Solana VersionedTransaction (base64) as the fee payer
 * (signature slot 0). Layout: compact-u16 signature count, 64-byte signatures,
 * then the message — the message is what gets signed.
 */
export function signTransaction(base64Tx: string): string {
  const tx = Buffer.from(base64Tx, 'base64');
  const numSignatures = tx[0];
  if (numSignatures === undefined || numSignatures >= 0x80) {
    throw new Error('Unsupported transaction signature count encoding');
  }
  const messageStart = 1 + numSignatures * 64;
  const message = tx.subarray(messageStart);
  const signature = edSign(null, message, privateKeyObject());
  signature.copy(tx, 1); // fee payer occupies the first signature slot
  return tx.toString('base64');
}
