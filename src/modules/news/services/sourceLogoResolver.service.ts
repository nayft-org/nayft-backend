import https from 'https';
import http from 'http';
import { redis } from '../../../config/redis';
import { SourceRegistry } from '../models/SourceRegistry';
import { recordSourceAudit } from '../models/SourceAuditLog';
import { SourceRepairQueue } from '../models/SourceRepairQueue';

const LOGO_CACHE_PREFIX = 'source:logo:';
const LOGO_CACHE_TTL_SEC = 86_400; // 24 h

const FAVICON_USER_AGENT = 'NAYFT-SourceBranding/1.0 (+https://nayft.com)';
const MAX_LOGO_BYTES = 256 * 1024; // 256 KB
const MIN_LOGO_SIZE = 16;

/**
 * Fetch a URL and return the binary buffer.
 * Follows one redirect. Rejects on non-2xx, oversized body, or timeout.
 */
function fetchBinary(url: string, timeoutMs = 8_000): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    const req = lib.get(url, { headers: { 'User-Agent': FAVICON_USER_AGENT } }, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchBinary(res.headers.location, timeoutMs).then(resolve).catch(reject);
      }
      if (!res.statusCode || res.statusCode < 200 || res.statusCode >= 300) {
        return reject(new Error(`HTTP ${res.statusCode} from ${url}`));
      }
      const chunks: Buffer[] = [];
      let size = 0;
      res.on('data', (chunk: Buffer) => {
        size += chunk.length;
        if (size > MAX_LOGO_BYTES) {
          req.destroy();
          reject(new Error('Logo exceeds 256KB limit'));
          return;
        }
        chunks.push(chunk);
      });
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    });
    req.setTimeout(timeoutMs, () => {
      req.destroy();
      reject(new Error(`Timeout fetching ${url}`));
    });
    req.on('error', reject);
  });
}

/**
 * Detect basic image magic bytes. Returns mime type or null.
 */
function detectImageMime(buf: Buffer): string | null {
  if (buf.length < 4) return null;
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'image/png';
  if (buf[0] === 0xff && buf[1] === 0xd8) return 'image/jpeg';
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) return 'image/gif';
  // ICO
  if (buf[0] === 0x00 && buf[1] === 0x00 && buf[2] === 0x01 && buf[3] === 0x00) return 'image/x-icon';
  // WebP
  if (buf.length >= 12 && buf.slice(0, 4).toString() === 'RIFF' && buf.slice(8, 12).toString() === 'WEBP') return 'image/webp';
  // SVG
  const start = buf.slice(0, 64).toString('utf8');
  if (start.includes('<svg') || start.includes('<?xml')) return 'image/svg+xml';
  return null;
}

/**
 * Build favicon URL candidates for a domain.
 */
function faviconCandidates(domain: string): string[] {
  return [
    `https://${domain}/favicon-32x32.png`,
    `https://${domain}/apple-touch-icon.png`,
    `https://${domain}/favicon.ico`,
    `https://www.google.com/s2/favicons?domain=${domain}&sz=64`,
  ];
}

/**
 * Attempt to fetch and validate a favicon from the domain.
 * Returns the first successful Buffer, or null.
 */
async function fetchFaviconBuffer(domain: string): Promise<Buffer | null> {
  for (const url of faviconCandidates(domain)) {
    try {
      const buf = await fetchBinary(url);
      const mime = detectImageMime(buf);
      if (!mime) continue;
      if (buf.length < MIN_LOGO_SIZE) continue;
      return buf;
    } catch {
      // try next candidate
    }
  }
  return null;
}

/**
 * Resolve the logo URL for a source key.
 *
 * Priority:
 *   1. Redis cache
 *   2. source_registry.sourceLogo (CDN URL)
 *   3. null (logo pipeline will fill it asynchronously)
 *
 * Never throws; returns null on any error.
 */
export async function resolveLogoUrl(sourceKey: string): Promise<string | null> {
  try {
    const cacheKey = `${LOGO_CACHE_PREFIX}${sourceKey}`;
    const cached = await redis.get(cacheKey);
    if (cached !== null) return cached || null;

    const entry = await SourceRegistry.findOne({ sourceKey }, { sourceLogo: 1 }).lean();
    const logoUrl = entry?.sourceLogo ?? null;

    await redis.setex(cacheKey, LOGO_CACHE_TTL_SEC, logoUrl ?? '');
    return logoUrl;
  } catch {
    return null;
  }
}

/**
 * Invalidate the Redis logo cache for a source key.
 */
export async function invalidateLogoCache(sourceKey: string): Promise<void> {
  try {
    await redis.del(`${LOGO_CACHE_PREFIX}${sourceKey}`);
  } catch {
    // non-fatal
  }
}

/**
 * Attempt to resolve a logo from the domain and store the result back on the registry.
 *
 * In production you would upload the buffer to S3 and store the CDN URL.
 * This implementation stores the Google favicon service URL as a safe fallback
 * until a real CDN/S3 pipeline is configured.
 */
export async function fetchAndStoreLogo(sourceKey: string): Promise<string | null> {
  const entry = await SourceRegistry.findOne({ sourceKey }).lean();
  if (!entry) return null;
  if (entry.sourceLogo) return entry.sourceLogo;
  if (!entry.sourceDomain) return null;

  await recordSourceAudit({ sourceKey, action: 'repair_logo_attempted', actorType: 'repair_job' });

  const buf = await fetchFaviconBuffer(entry.sourceDomain);
  if (!buf) {
    await recordSourceAudit({
      sourceKey,
      action: 'repair_logo_failed',
      newValue: { reason: 'no valid favicon found' },
      actorType: 'repair_job',
    });
    return null;
  }

  // Fallback: use the Google favicon CDN URL as the stored logo URL.
  // Replace this with an S3 upload + CDN URL when the pipeline is configured.
  const logoUrl = `https://www.google.com/s2/favicons?domain=${entry.sourceDomain}&sz=64`;

  await SourceRegistry.updateOne(
    { sourceKey },
    {
      $set: {
        sourceLogo: logoUrl,
        logoSource: 'favicon',
        logoFetchedAt: new Date(),
      },
    }
  );
  await invalidateLogoCache(sourceKey);

  await recordSourceAudit({
    sourceKey,
    action: 'repair_logo_succeeded',
    newValue: { logoUrl, logoSource: 'favicon' },
    actorType: 'repair_job',
  });

  return logoUrl;
}

/**
 * Enqueue a logo repair job for a source key if not already pending/processing.
 */
export async function enqueueLogo(sourceKey: string): Promise<void> {
  try {
    await SourceRepairQueue.updateOne(
      { sourceKey, repairType: 'logo' },
      {
        $setOnInsert: {
          sourceKey,
          repairType: 'logo',
          attempts: 0,
          status: 'pending',
        },
      },
      { upsert: true }
    );
  } catch (err: any) {
    if (err?.code !== 11000) console.error('[sourceLogoResolver] enqueueLogo error', err);
  }
}
