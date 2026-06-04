# PI Engine Governance

Binding rules for deterministic portfolio analytics. See master plan Part III.

## Formula immutability

- Never edit `formulas/v1/*.json` after merge to `main`
- Changes require new version directory and RFC

## Replay

- Certification replays use `replayPin` from snapshot
- Use `scripts/pi-replay-user.ts` for offline validation

## Rollback

1. Disable `portfolio_intelligence_engines` feature flag
2. Set `PI_FORMULA_BUNDLE_PIN=v1` if formula rollback needed

## Partial payloads

- Fanout only when `complete && !partial`
- Health score `null` when unknown (not zero)
