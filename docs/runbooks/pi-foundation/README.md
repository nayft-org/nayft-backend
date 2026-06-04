# Portfolio Intelligence Foundation — Runbooks

| ID | Topic |
|----|--------|
| [PI-001](./PI-001-queue-backlog.md) | Queue backlog |
| [PI-004](./PI-004-multi-replica-ws.md) | Multi-replica WebSocket |

## Go-live checklist (G9)

- [ ] Enable flags in order: `portfolio_intelligence_foundation` → `PI_WORKER_ENABLED` → shadow → context API → realtime → normalized read
- [ ] 72h staging soak on recompute queue
- [ ] Shadow drift p99 ≤ 1% for 7 days
- [ ] Two-replica WS test with `PI_FANOUT_ENABLED`
- [ ] Rollback drill: `PI_ENABLED=false` under 60s

## Env reference

| Variable | Default | Purpose |
|----------|---------|---------|
| `PI_ENABLED` | false | Master compute |
| `PI_SHADOW_MODE` | true | Shadow Redis prefix |
| `PI_WORKER_ENABLED` | false | Recompute consumer |
| `PI_ENQUEUE_ENABLED` | false | Webhook enqueue |
| `PI_FANOUT_ENABLED` | false | Cross-replica WS |
| `PI_API_ZERION_SLEEP_DISABLED` | false | G7: remove 2s sleep |
| `PI_AGGREGATOR_UPSERT_DISABLED` | false | G7: stop hot-path upsert |
