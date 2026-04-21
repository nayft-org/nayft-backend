/**
 * Zerion webhook signature verification (certificate-based headers).
 *
 * Canonical reference: https://developers.zerion.io — Webhooks section (verify algorithm against published docs when troubleshooting).
 *
 * Headers: X-Certificate-URL, X-Timestamp, X-Signature — raw body bytes must match Express `verify` buffer exactly.
 */

import crypto, { X509Certificate } from 'crypto';

const FETCH_MS        = 5000;
const MAX_SKEW_MS     = 300_000;
const MAX_CACHE       = 10;
const DOC_URL_COMMENT = 'https://developers.zerion.io';

/** Hostname → PEM string; naive LRU: on overflow delete first Map insertion (oldest). */
const pemCache = new Map<string, string>();

function cachePem(hostname: string, pem: string): void {
  if (pemCache.size >= MAX_CACHE && !pemCache.has(hostname)) {
    const first = pemCache.keys().next().value as string | undefined;
    if (first) pemCache.delete(first);
  }
  pemCache.set(hostname, pem);
}

function getHeader(headers: NodeJS.Dict<string | string[] | undefined>, name: string): string | undefined {
  const lower = name.toLowerCase();
  for (const [k, v] of Object.entries(headers)) {
    if (k.toLowerCase() === lower) {
      if (Array.isArray(v)) return v[0];
      return v;
    }
  }
  return undefined;
}

async function fetchPem(certUrl: string): Promise<string | null> {
  let hostname: string;
  try {
    hostname = new URL(certUrl).hostname;
  } catch {
    return null;
  }
  const hit = pemCache.get(hostname);
  if (hit) return hit;

  const ac = new AbortController();
  const t  = setTimeout(() => ac.abort(), FETCH_MS);
  try {
    const res = await fetch(certUrl, { signal: ac.signal });
    if (!res.ok) return null;
    const text = await res.text();
    if (!text.includes('BEGIN CERTIFICATE')) return null;
    cachePem(hostname, text);
    return text;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

function parseTimestampMs(raw: string): number | null {
  const n = parseInt(raw, 10);
  if (Number.isNaN(n)) return null;
  if (n < 1e12) return n * 1000;
  return n;
}

function decodeSignature(sig: string): Buffer {
  const s = sig.trim();
  try {
    return Buffer.from(s, 'base64');
  } catch {
    /* fallthrough */
  }
  if (/^[0-9a-fA-F]+$/.test(s) && s.length % 2 === 0) {
    return Buffer.from(s, 'hex');
  }
  return Buffer.from(s, 'base64');
}

/**
 * Verify Zerion webhook using X-Certificate-URL, X-Timestamp, X-Signature over raw body.
 */
export async function verifyZerionWebhook(
  rawBody: Buffer,
  headers: NodeJS.Dict<string | string[] | undefined>
): Promise<boolean> {
  const certUrl = getHeader(headers, 'x-certificate-url');
  const tsRaw   = getHeader(headers, 'x-timestamp');
  const sigRaw  = getHeader(headers, 'x-signature');
  if (!certUrl || !tsRaw || !sigRaw) {
    console.warn('[ZerionVerify] missing X-Certificate-URL, X-Timestamp, or X-Signature');
    return false;
  }

  const tsMs = parseTimestampMs(tsRaw);
  if (tsMs === null || Math.abs(Date.now() - tsMs) > MAX_SKEW_MS) {
    console.warn('[ZerionVerify] timestamp missing or skew > 300s');
    return false;
  }

  const pem = await fetchPem(certUrl);
  if (!pem) {
    console.warn('[ZerionVerify] failed to load certificate from X-Certificate-URL');
    return false;
  }

  let cert: X509Certificate;
  try {
    cert = new X509Certificate(pem);
  } catch {
    console.warn('[ZerionVerify] invalid PEM');
    return false;
  }

  const publicKey = cert.publicKey;
  const sigBuf      = decodeSignature(sigRaw);

  const tryAlg = (alg: string): boolean => {
    try {
      return crypto.verify(alg, rawBody, publicKey, sigBuf);
    } catch {
      return false;
    }
  };

  if (tryAlg('RSA-SHA256')) return true;
  if (tryAlg('RSA-SHA512')) return true;
  if (tryAlg('sha256')) {
    try {
      return crypto.verify('sha256', rawBody, publicKey, sigBuf);
    } catch {
      /* continue */
    }
  }

  console.warn(
    `[ZerionVerify] signature verify failed (see ${DOC_URL_COMMENT} for algorithm updates)`
  );
  return false;
}
