# PI-001 Queue backlog

1. Set `PI_ENQUEUE_PAUSED=1` or Redis key `pi:recompute:enqueue_paused`.
2. Scale `dev:worker:pi-recompute` replicas.
3. Monitor `pi_recompute_queue_depth` until below 5000.
4. Clear pause flag and resume enqueue.

Rollback: `PI_WORKER_ENABLED=false`.
