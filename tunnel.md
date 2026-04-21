# Webhook Tunnel & Connection Guide

This document explains how to expose the backend webhook endpoints to Alchemy and Zerion
using a Cloudflare Quick Tunnel, and how to register the resulting URLs with each provider.

---

## How It Works

```
Alchemy / Zerion  →  trycloudflare.com  →  cloudflared  →  localhost:4001
```

When `cloudflared` is running it creates a secure HTTPS tunnel from the internet
to port `4001` on this machine. Alchemy and Zerion send wallet activity events as
HTTP POST requests to that public URL, which forwards them to the Express backend.

The two webhook endpoints are:

| Provider | Path                                    |
|----------|-----------------------------------------|
| Alchemy  | `{WEBHOOK_BASE_URL}/api/portfolio/webhooks/alchemy` |
| Zerion   | `{WEBHOOK_BASE_URL}/api/portfolio/webhooks/zerion`  |

### Environment: `ALLOW_PROVIDER_SUBSCRIPTION_WRITES`

- Default **`true`**: adding/removing a wallet updates Alchemy Notify address lists and Zerion subscription wallets (same as before).
- Set **`false`** in local `.env` when you must **not** call provider APIs (e.g. shared Zerion subscription or production webhook targets) but still want to create/delete `WalletAddress` rows in your dev database.

### Production vs local topology

- **Production/staging:** The portfolio rollout assumes **one API replica** until Redis-backed portfolio fan-out ships; see `docs/runbooks/portfolio-webhook-ingress-azure.md`.
- **Local:** Tunnel URL changes when `cloudflared` restarts; update Alchemy/Zerion dashboards only for **dev** projects, never production webhook URLs.

---

## Step 1 — Start the Tunnel

Make sure the backend is running on port `4001` first, then start the tunnel:

```bash
# Foreground (visible output)
cloudflared tunnel --url http://localhost:4001

# Background (recommended for dev sessions)
nohup cloudflared tunnel --url http://localhost:4001 > ~/cloudflared.log 2>&1 &
```

The output contains the generated public URL:

```
+-----------------------------------------------------------------------+
|  Your quick Tunnel has been created! Visit it at:                     |
|  https://random-words-here.trycloudflare.com                          |
+-----------------------------------------------------------------------+
```

Verify the tunnel reaches the backend:

```bash
curl https://random-words-here.trycloudflare.com/health
# Expected: {"status":"ok","timestamp":"..."}
```

> NOTE: The Quick Tunnel URL changes every time the tunnel restarts. When it changes,
> follow the "Updating the Tunnel URL" section below before any webhooks will work again.

---

## Step 2 — Set WEBHOOK_BASE_URL in .env

```dotenv
WEBHOOK_BASE_URL=https://random-words-here.trycloudflare.com
```

---

## Step 3 — Connect Alchemy

### 3a. Create Address Activity webhooks in Alchemy Dashboard

1. Go to [dashboard.alchemy.com/apps/latest/webhooks](https://dashboard.alchemy.com/apps/latest/webhooks)
2. Copy the **Auth Token** at the top of the page → set `ALCHEMY_AUTH_TOKEN` in `.env`
3. For each chain (ETH, Polygon, BNB), click **Create Webhook**:
   - Webhook Type: **Address Activity**
   - Chain / Network: select the correct one (e.g. Ethereum Mainnet for ETH)
   - Webhook URL: `https://<tunnel-url>/api/portfolio/webhooks/alchemy`
4. After creation, from each webhook's detail page:
   - Copy the **Webhook ID** (format: `wh_xxx`)
   - Copy the **Signing Key** (format: `whsec_xxx`)

### 3b. Set the IDs and signing keys in .env

```dotenv
ALCHEMY_AUTH_TOKEN=<auth-token-from-top-of-dashboard>
ALCHEMY_WEBHOOK_IDS={"eth":"wh_xxx","polygon":"wh_yyy","bnb":"wh_zzz"}
ALCHEMY_WEBHOOK_SIGNING_KEYS={"eth":"whsec_aaa","polygon":"whsec_bbb","bnb":"whsec_ccc"}
```

### 3c. Test

Use the **Test Webhook** button on each webhook in the Alchemy dashboard.
The backend should log the incoming event and respond with `200 ok`.

---

## Step 4 — Connect Zerion

### Dev key (automatic)

With a Zerion dev key in `ZERION_API_KEY`, the subscription is created automatically
the first time a wallet is added via the app. The backend logs the subscription ID:

```
[ZerionSubscriptions] Created subscription <id>. Save ZERION_SUBSCRIPTION_ID=<id> in .env
```

Copy that ID and save it:

```dotenv
ZERION_SUBSCRIPTION_ID=<id-from-log>
```

> Dev key limits: 1 subscription, max 5 wallets, 1-week validity.

### Production

For production use, email `api@zerion.io` with:
- Your callback host (`https://random-words-here.trycloudflare.com` or your production domain)
- Your Zerion API email

They will whitelist your host and issue a production key. After receiving it, restart
the backend — the subscription will be created on the first wallet add.

---

## Updating the Tunnel URL (when tunnel restarts)

Each Quick Tunnel restart generates a new URL. Follow these steps to re-register:

### 1. Start the tunnel and get the new URL

```bash
cloudflared tunnel --url http://localhost:4001
```

### 2. Update .env

```dotenv
WEBHOOK_BASE_URL=https://new-url.trycloudflare.com
```

### 3. Update Alchemy webhook URLs

For each chain webhook in [Alchemy Dashboard](https://dashboard.alchemy.com/apps/latest/webhooks):
- Open the webhook → Edit → update the Webhook URL to the new tunnel URL
- Alternatively, use the Alchemy API:

```bash
curl "https://dashboard.alchemy.com/api/update-webhook" \
  --request PUT \
  --header "X-Alchemy-Token: $ALCHEMY_AUTH_TOKEN" \
  --json '{"webhook_id": "wh_xxx", "webhook_url": "https://new-url.trycloudflare.com/api/portfolio/webhooks/alchemy"}'
```

### 4. Update Zerion callback URL

```bash
curl "https://api.zerion.io/v1/tx-subscriptions/$ZERION_SUBSCRIPTION_ID/callback_url" \
  --request PATCH \
  --header "Authorization: Basic $(echo -n '$ZERION_API_KEY:' | base64)" \
  --header "Content-Type: application/json" \
  --json '{"data": {"callback_url": "https://new-url.trycloudflare.com/api/portfolio/webhooks/zerion"}}'
```

### 5. Restart the backend

```bash
# Restart so it picks up the new WEBHOOK_BASE_URL
npm run dev  # or your start command
```

---

## Environment Variables Reference

| Variable | Description | Where to get it |
|----------|-------------|-----------------|
| `WEBHOOK_BASE_URL` | Public tunnel URL | From `cloudflared` output |
| `ALCHEMY_AUTH_TOKEN` | Alchemy Notify auth token | Top of [Alchemy Webhooks dashboard](https://dashboard.alchemy.com/apps/latest/webhooks) |
| `ALCHEMY_NOTIFY_BASE_URL` | Alchemy Notify management API | Default: `https://dashboard.alchemy.com/api` |
| `ALCHEMY_WEBHOOK_IDS` | JSON map of chain → webhook ID | Each webhook's detail page in Alchemy dashboard |
| `ALCHEMY_WEBHOOK_SIGNING_KEYS` | JSON map of chain → signing key | Each webhook's detail page in Alchemy dashboard |
| `ALCHEMY_API_KEY` | Alchemy RPC API key | [Alchemy Apps dashboard](https://dashboard.alchemy.com) |
| `ZERION_API_KEY` | Zerion API key | [Zerion API Dashboard](https://dashboard.zerion.io) |
| `ZERION_SUBSCRIPTION_ID` | Zerion tx-subscription ID | Logged on first wallet add, or from Zerion dashboard |
| `ZERION_BASE_URL` | Zerion REST API base URL | Default: `https://api.zerion.io/v1` |

---

## End-to-End Test

Once everything is configured, add a wallet address via the app and trigger a test
transaction. You should see:

1. Alchemy sends a POST to `{WEBHOOK_BASE_URL}/api/portfolio/webhooks/alchemy`
2. Backend logs the event and verifies the HMAC signature
3. `ingestWalletEvent` is called → `walletEventAggregator` buffers the event
4. After the aggregation window, the event is saved to MongoDB and broadcast via WebSocket
5. The Portfolio screen in the app shows the new event

---

## Future Upgrade: Permanent URL with nayft.in

To avoid updating the URL on every tunnel restart, connect `nayft.in` to Cloudflare:

1. Add `nayft.in` to your Cloudflare account (free plan) and change nameservers at your registrar
2. Once DNS propagates, create a named tunnel:
   ```bash
   cloudflared tunnel create crypto-backend
   cloudflared tunnel route dns crypto-backend webhooks.nayft.in
   ```
3. Create `~/.cloudflared/config.yml`:
   ```yaml
   tunnel: crypto-backend
   credentials-file: /home/gyan/.cloudflared/<TUNNEL_ID>.json
   ingress:
     - hostname: webhooks.nayft.in
       service: http://localhost:4001
     - service: http_status:404
   ```
4. Install as a system service (auto-starts on boot):
   ```bash
   sudo cloudflared service install
   sudo systemctl enable cloudflared && sudo systemctl start cloudflared
   ```
5. Update `WEBHOOK_BASE_URL=https://webhooks.nayft.in` in `.env` — permanent, never changes again
