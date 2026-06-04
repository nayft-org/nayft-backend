# PI Engine Rollout

## Flag order

1. `portfolio_intelligence_engines`
2. `portfolio_intelligence_health_score`
3. `portfolio_intelligence_insights`
4. `portfolio_intelligence_feed_intel`

## Verification

- `GET /api/portfolio/intelligence/summary` returns health + risk
- `GET /api/portfolio/intelligence/insights` returns insight list
- `/api/metrics` includes `portfolioIntelligence` block
- Run `npx ts-node --transpile-only scripts/pi-replay-user.ts <userId>`

## Rollback

- Disable `portfolio_intelligence_engines`
- Set `PI_FORMULA_BUNDLE_PIN=v1` if needed
