import { loadTaxonomyV1 } from '../../config/piFormulaRegistry';

export function mapCategoryToNayftBucket(
  categoryId: string | null,
  categoryName: string | null,
  symbol: string
): string {
  const tax = loadTaxonomyV1();
  const sym = symbol.toUpperCase();
  if (tax.symbolOverrides[sym]) return tax.symbolOverrides[sym];

  const hay = `${categoryId ?? ''} ${categoryName ?? ''}`.toLowerCase();
  for (const bucket of tax.buckets) {
    const patterns = tax.coingeckoPatterns[bucket];
    if (!patterns) continue;
    if (patterns.some((p) => hay.includes(p))) return bucket;
  }
  return 'Other';
}
