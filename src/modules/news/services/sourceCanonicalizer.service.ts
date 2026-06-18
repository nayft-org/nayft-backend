import { SourceRegistry, SourceAlias, defaultTrustForStatus } from '../models/SourceRegistry';
import { recordSourceAudit } from '../models/SourceAuditLog';

/**
 * Step 1: Unicode normalize, strip punctuation (except hyphen), collapse spaces, lowercase.
 */
export function normalizeRawName(raw: string): string {
  return raw
    .trim()
    .normalize('NFKC')
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

/**
 * Step 2: Convert normalized name to a URL-safe slug.
 */
export function toSlug(normalized: string): string {
  return normalized.trim().replace(/\s+/g, '-').replace(/-+/g, '-');
}

/**
 * Parse hostname from a URL string, stripping leading www.
 * Returns empty string on failure.
 */
export function extractDomain(rawUrl: string): string {
  try {
    const url = new URL(rawUrl);
    return url.hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return '';
  }
}

/**
 * Core canonicalization pipeline.
 *
 * Resolution order:
 *   1. Alias lookup by normalized name slug
 *   2. Domain alias lookup (when sourceUrl provided)
 *   3. Create new pending registry entry
 *
 * Returns the canonical sourceKey and whether a new registry entry was created.
 */
export async function canonicalizeSource(
  rawName: string,
  sourceUrl?: string
): Promise<{ sourceKey: string; created: boolean }> {
  const normalized = normalizeRawName(rawName);
  const slug = toSlug(normalized);

  // Step 1: direct alias lookup on normalized slug
  const nameAlias = await SourceAlias.findOne({ aliasKey: slug }).lean();
  if (nameAlias) {
    return { sourceKey: nameAlias.sourceKey, created: false };
  }

  // Step 2: domain fallback when URL is provided
  if (sourceUrl) {
    const domain = extractDomain(sourceUrl);
    if (domain) {
      const domainAlias = await SourceAlias.findOne({ aliasKey: domain }).lean();
      if (domainAlias) {
        // Also add a name alias so future lookups are faster
        await addAlias(slug, domainAlias.sourceKey, 'name').catch(() => {});
        return { sourceKey: domainAlias.sourceKey, created: false };
      }
    }
  }

  // Step 3: create new pending registry entry
  const sourceKey = slug || 'unknown';
  const domain = sourceUrl ? extractDomain(sourceUrl) : '';
  const defaults = defaultTrustForStatus('pending');

  const existing = await SourceRegistry.findOne({ sourceKey }).lean();
  if (existing) {
    return { sourceKey, created: false };
  }

  await SourceRegistry.create({
    sourceKey,
    sourceName: rawName.trim() || sourceKey,
    sourceDomain: domain,
    status: 'pending',
    trustScore: defaults.trustScore,
    trustCategory: defaults.trustCategory,
    isActive: false,
    discoveredAt: new Date(),
  });

  await recordSourceAudit({
    sourceKey,
    action: 'publisher_created',
    newValue: { sourceName: rawName.trim(), sourceDomain: domain },
    actorType: 'ingest',
  });

  // Add name slug as alias
  await addAlias(slug, sourceKey, 'name').catch(() => {});
  if (domain) {
    await addAlias(domain, sourceKey, 'domain').catch(() => {});
  }

  return { sourceKey, created: true };
}

/**
 * Upsert a source alias. Silently ignores duplicate-key errors.
 */
export async function addAlias(
  aliasKey: string,
  sourceKey: string,
  aliasType: 'name' | 'domain' | 'legacy_key'
): Promise<void> {
  if (!aliasKey) return;
  try {
    await SourceAlias.updateOne(
      { aliasKey },
      { $setOnInsert: { aliasKey, sourceKey, aliasType } },
      { upsert: true }
    );
    await recordSourceAudit({
      sourceKey,
      action: 'alias_added',
      newValue: { aliasKey, aliasType },
      actorType: 'system',
    });
  } catch (err: any) {
    // E11000 duplicate key — alias already exists, harmless
    if (err?.code !== 11000) {
      console.error('[sourceCanonicalizer] addAlias failed', { aliasKey, sourceKey, err });
    }
  }
}

/**
 * Seed the initial known aliases for bootstrap.
 * Safe to call multiple times (idempotent).
 */
export async function seedKnownAliases(): Promise<void> {
  const knownAliases: Array<{ aliasKey: string; sourceKey: string; aliasType: 'name' | 'domain' | 'legacy_key' }> = [
    { aliasKey: 'coindesk', sourceKey: 'coindesk', aliasType: 'name' },
    { aliasKey: 'coin-desk', sourceKey: 'coindesk', aliasType: 'name' },
    { aliasKey: 'coindesk.com', sourceKey: 'coindesk', aliasType: 'domain' },
    { aliasKey: 'www.coindesk.com', sourceKey: 'coindesk', aliasType: 'domain' },
    { aliasKey: 'reuters', sourceKey: 'reuters', aliasType: 'name' },
    { aliasKey: 'reuters.com', sourceKey: 'reuters', aliasType: 'domain' },
    { aliasKey: 'bloomberg', sourceKey: 'bloomberg', aliasType: 'name' },
    { aliasKey: 'bloomberg.com', sourceKey: 'bloomberg', aliasType: 'domain' },
    { aliasKey: 'the-block', sourceKey: 'the-block', aliasType: 'name' },
    { aliasKey: 'theblock', sourceKey: 'the-block', aliasType: 'name' },
    { aliasKey: 'theblock.co', sourceKey: 'the-block', aliasType: 'domain' },
    { aliasKey: 'decrypt', sourceKey: 'decrypt', aliasType: 'name' },
    { aliasKey: 'decrypt.co', sourceKey: 'decrypt', aliasType: 'domain' },
    { aliasKey: 'cointelegraph', sourceKey: 'cointelegraph', aliasType: 'name' },
    { aliasKey: 'coin-telegraph', sourceKey: 'cointelegraph', aliasType: 'name' },
    { aliasKey: 'cointelegraph.com', sourceKey: 'cointelegraph', aliasType: 'domain' },
    { aliasKey: 'cryptonews', sourceKey: 'cryptonews', aliasType: 'name' },
    { aliasKey: 'crypto-news', sourceKey: 'cryptonews', aliasType: 'name' },
    { aliasKey: 'crypto.news', sourceKey: 'cryptonews', aliasType: 'domain' },
  ];

  for (const alias of knownAliases) {
    try {
      await SourceAlias.updateOne(
        { aliasKey: alias.aliasKey },
        { $setOnInsert: alias },
        { upsert: true }
      );
    } catch (err: any) {
      if (err?.code !== 11000) {
        console.error('[sourceCanonicalizer] seedKnownAliases error', err);
      }
    }
  }
}
