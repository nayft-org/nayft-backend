# Source Branding — Disaster Recovery Runbook

## Backup Scope

| Asset | Method | Frequency | Location |
|-------|--------|-----------|----------|
| `source_registry` | `mongodump` | Daily + pre-migration | `.backups/source-branding/{TS}/` |
| `source_aliases` | `mongodump` | Daily + pre-migration | Same directory |
| Logo S3 bucket | S3 versioning + (optional) cross-region replication | Continuous | Cloud provider |
| Checkpoint files | Local directory | Per backfill run | `.backups/source-branding/{runId}/` |

### Pre-migration Backup Commands

```bash
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR=".backups/source-branding/${TIMESTAMP}"
mkdir -p "$BACKUP_DIR"

# Backup source_registry and source_aliases
mongodump \
  --uri="$MONGO_URI" \
  --collection=source_registry \
  --db=crypto_db \
  --out="$BACKUP_DIR"

mongodump \
  --uri="$MONGO_URI" \
  --collection=source_aliases \
  --db=crypto_db \
  --out="$BACKUP_DIR"

echo "Backup complete: $BACKUP_DIR"
```

---

## Recovery Scenarios

### Scenario 1: `source_registry` Accidentally Deleted

1. Stop ingest (set `NEWS_INGEST` kill switch in runtime config or halt cron)
2. Restore from latest backup:
   ```bash
   mongorestore \
     --uri="$MONGO_URI" \
     --drop \
     --dir=".backups/source-branding/<TIMESTAMP>/crypto_db/source_registry.bson" \
     --collection=source_registry \
     --db=crypto_db
   ```
3. Run consistency validator:
   ```bash
   npx ts-node scripts/source-branding-readiness.ts
   ```
4. Run denorm sync via admin endpoint:
   ```bash
   curl -X POST /admin/sources/article-counts/refresh -H "x-admin-secret: $ADMIN_SECRET"
   ```
5. Bump feed revision:
   ```bash
   npx ts-node -e "require('./src/modules/news/newsFeedRevision').bumpNewsFeedRevision().then(() => process.exit())"
   ```
6. Resume ingest

---

### Scenario 2: `source_aliases` Corrupted

1. Restore from latest backup:
   ```bash
   mongorestore \
     --uri="$MONGO_URI" \
     --drop \
     --dir=".backups/source-branding/<TIMESTAMP>/crypto_db/source_aliases.bson" \
     --collection=source_aliases \
     --db=crypto_db
   ```
2. Re-seed known aliases:
   ```bash
   npx ts-node scripts/seed-source-registry.ts
   ```
3. Run dry-run of backfill to verify no regression:
   ```bash
   npx ts-node scripts/backfill-source-branding.ts
   ```

---

### Scenario 3: Logo Bucket Lost

1. Restore S3 from versioning if available
2. If unrecoverable: clear `sourceLogo` on all registry entries
3. Run logo repair (re-fetches favicons):
   ```bash
   curl -X POST /admin/sources/repair/replay \
     -H "Content-Type: application/json" \
     -d '{"repairType":"logo"}' \
     -H "x-admin-secret: $ADMIN_SECRET"
   ```
4. Monitor repair status: `GET /admin/sources/repair/status`

---

### Scenario 4: Migration Partially Completed

1. Read checkpoint file in `.backups/source-branding/<runId>/checkpoint.json`
2. Resume from checkpoint:
   ```bash
   npx ts-node scripts/backfill-source-branding.ts --apply --resume-from-checkpoint
   ```
3. OR rollback if checkpoint state is unclear:
   ```bash
   npx ts-node scripts/rollback-source-branding.ts    # dry-run first
   npx ts-node scripts/rollback-source-branding.ts --apply
   ```
4. Run readiness check after recovery:
   ```bash
   npx ts-node scripts/source-branding-readiness.ts
   ```

---

## RTO / RPO Targets

| Tier | RPO | RTO |
|------|-----|-----|
| Registry metadata | 24 h (daily dump) | 1 hour |
| Logo assets | 0 (S3 versioning) | 2 hours (re-fetch) |
| Article denormalized fields | Recomputable from registry + sourceUrl | 4 hours (denorm sync) |

## Feed Continuity During DR

Articles retain the last denormalized `source.name` even if the registry is down — the feed is never empty. Logos degrade to letter placeholders on the mobile client without any error state.
