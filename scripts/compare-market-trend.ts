/**
 * Compare /api/charts/market-trend vs /market-trend-v2 (same query params).
 * Run: npx ts-node --transpile-only scripts/compare-market-trend.ts
 */
const base = (process.env.API_BASE_URL || 'http://localhost:4001/api').replace(/\/$/, '');

async function main() {
  const q = 'interval=1m&limit=120&maxCoins=25';
  const [r1, r2] = await Promise.all([
    fetch(`${base}/charts/market-trend?${q}`).then((r) => r.json()),
    fetch(`${base}/charts/market-trend-v2?${q}`).then((r) => r.json()),
  ]);

  const p1 = Array.isArray(r1?.points) ? r1.points : [];
  const p2 = Array.isArray(r2?.points) ? r2.points : [];

  let maxDelta = 0;
  const n = Math.min(p1.length, p2.length);
  for (let i = 0; i < n; i++) {
    const v1 = Number(p1[i]?.value);
    const v2 = Number(p2[i]?.value);
    if (Number.isFinite(v1) && Number.isFinite(v2) && v1 !== 0) {
      maxDelta = Math.max(maxDelta, Math.abs(v1 - v2) / Math.abs(v1));
    }
  }

  console.log(JSON.stringify({ v1Points: p1.length, v2Points: p2.length, relativeMaxDelta: maxDelta }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
