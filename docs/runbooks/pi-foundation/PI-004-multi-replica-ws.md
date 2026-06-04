# PI-004 Multi-replica WebSocket desync

1. Set `PI_FANOUT_ENABLED=false` — in-process fanout remains on each replica.
2. Verify `pi:fanout` Redis channel receives messages.
3. Re-enable canary on one API replica.
4. Confirm clients receive `analytics_revision` with monotonic `seq`.

Production: multi-replica allowed when `portfolio_intelligence_realtime` is on and soak passed.
