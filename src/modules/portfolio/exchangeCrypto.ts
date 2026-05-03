import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';
import { config } from '../../config/env';

const ALGO = 'aes-256-gcm';
const IV_LEN = 12;
const TAG_LEN = 16;
const KEY_ID = 'v1';

function deriveKeyFromJwtFallback(): Buffer {
  const salt = 'exchange-secrets-v1';
  return scryptSync(config.jwtSecret, salt, 32);
}

function resolveKey(): Buffer {
  const hex = config.exchangeSecretsKeyHex;
  if (hex.length === 64 && /^[0-9a-fA-F]+$/.test(hex)) {
    return Buffer.from(hex, 'hex');
  }
  if (config.nodeEnv === 'production' && !hex) {
    throw new Error('EXCHANGE_SECRETS_KEY_HEX is required in production');
  }
  console.warn('[exchangeCrypto] EXCHANGE_SECRETS_KEY_HEX unset; deriving key from jwtSecret (dev only)');
  return deriveKeyFromJwtFallback();
}

let cachedKey: Buffer | null = null;
function getKey(): Buffer {
  if (!cachedKey) cachedKey = resolveKey();
  return cachedKey;
}

export interface EncryptedBlob {
  encryptionKeyId: string;
  ciphertext: string;
}

export function encryptExchangeCredentials(payload: { apiKey: string; apiSecret: string }): EncryptedBlob {
  const key = getKey();
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, key, iv);
  const plain = Buffer.from(JSON.stringify(payload), 'utf8');
  const enc = Buffer.concat([cipher.update(plain), cipher.final()]);
  const tag = cipher.getAuthTag();
  const combined = Buffer.concat([iv, tag, enc]);
  return {
    encryptionKeyId: KEY_ID,
    ciphertext: combined.toString('base64'),
  };
}

export function decryptExchangeCredentials(blob: EncryptedBlob): { apiKey: string; apiSecret: string } {
  const key = getKey();
  const raw = Buffer.from(blob.ciphertext, 'base64');
  if (raw.length < IV_LEN + TAG_LEN + 1) {
    throw new Error('Invalid credential blob');
  }
  const iv = raw.subarray(0, IV_LEN);
  const tag = raw.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const enc = raw.subarray(IV_LEN + TAG_LEN);
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  const dec = Buffer.concat([decipher.update(enc), decipher.final()]);
  const parsed = JSON.parse(dec.toString('utf8')) as { apiKey?: string; apiSecret?: string };
  if (!parsed.apiKey || !parsed.apiSecret) {
    throw new Error('Credential payload missing fields');
  }
  return { apiKey: parsed.apiKey, apiSecret: parsed.apiSecret };
}
