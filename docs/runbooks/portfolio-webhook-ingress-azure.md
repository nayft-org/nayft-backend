# Portfolio webhook ingress (Azure) — raw body and replica count

**Scope:** `POST /api/portfolio/webhooks/alchemy` and `POST /api/portfolio/webhooks/zerion` only. No changes to other routes in this runbook.

## 1. Raw request body (HMAC / signature verification)

Alchemy signs the **exact** UTF-8 bytes of the JSON body. The Node app captures this via `express.json` `verify` (`req.rawBody`). **Ingress must not modify the body** for these paths:

- No JSON reformatting, pretty-printing, or key reordering.
- No decompression/recompression that changes octets.
- If using Azure Application Gateway, Azure Front Door, or WAF: add **exclusions** or **rule bypass** for `POST /api/portfolio/webhooks/*` so the request body forwarded to the origin matches the client payload.

**References (external):**

- [Azure Application Gateway — WAF exclusions](https://learn.microsoft.com/azure/web-application-firewall/ag/application-gateway-waf-configuration)
- [Azure Front Door — WAF policies](https://learn.microsoft.com/azure/frontdoor/front-door-waf)

## 2. WebSocket `/ws` (portfolio + market)

This rollout does **not** require ingress changes for `/ws`. Ensure WebSocket upgrades and idle timeouts are compatible with mobile clients (product default).

## 3. Replica count (locked for this rollout)

**Production and staging:** run the API workload at **exactly one replica** until a future rollout adds Redis-backed portfolio event fan-out or equivalent coordination.

Multi-instance webhook ingestion **without** shared aggregation state would duplicate `WalletEvent` rows and break in-memory debounce semantics.

## 4. Ownership

- **Application:** portfolio module (`src/modules/portfolio/`).
- **Ingress / WAF / replica count:** platform / DevOps; this file is the in-repo checklist only.
