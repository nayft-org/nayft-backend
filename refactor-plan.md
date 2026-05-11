# Refactor prep plan — crypto-backend

**Purpose:** A curated reading list of Martin Fowler refactoring techniques (from *Refactoring*) to study **before** attempting refactors, so changes stay **relevant** to this codebase and **future-safe**.

**Audience:** Maintainers working on `crypto-backend` (Express, MongoDB/Mongoose, Redis, WebSockets, cron, integrations).

---

## 1. How this backend is shaped (why the list looks like this)

- **Modular monolith** — Express modules under `src/modules/*`, shared `core/` (feature system, event system, admin), `services/`, `workers/`, `websocket/`.
- **Colocated runtime** — `server.ts` wires HTTP + WebSocket + event worker + inline Binance ticker + exchange poll scheduler + cron (klines, snapshots). Startup ordering and env flags matter.
- **Heavy integration seams** — Portfolio (Alchemy, Zerion, webhooks, exchange merge), coin identity + ingestion, market snapshots, search across segments, i18n, vendor HTTP clients.
- **Known tight coupling** (harder extractions without design intent) — portfolio graph, coin ontology, feature + event taxonomy, news + translation paths. Refactors there need **tests and small steps**.

Refactor literacy here means: **short composable methods**, **clear read vs write**, **stable internal boundaries**, and **polymorphism only where the domain has real variants** — not pattern-chasing.

---

## 2. Tier 1 — Read first (daily refactor literacy)

These techniques match what the code already does: long `async` flows, nested `if`/`switch`, caches, feature flags, and cross-file orchestration.

| Topic | Why it matters here |
|--------|---------------------|
| **Extract Method** | Natural split points in `coin/service`, `portfolio/service`, `search/service` without changing behavior. |
| **Replace Nested Conditional with Guard Clauses** | Early exits reduce depth in holdings/coin resolution and webhook paths. |
| **Decompose Conditional** | Breaks up large decision trees into named pieces. |
| **Consolidate Conditional Expression** | When the same boolean intent is expressed in scattered forms. |
| **Consolidate Duplicate Conditional Fragments** | TTL/stale/feature-flag logic often repeats across modules. |
| **Replace Temp with Query** | Clarifies long async pipelines. |
| **Introduce Explaining Variable** | Names for intermediate results in multi-step flows. |
| **Inline Temp** | Remove noise when a temp adds no clarity. |
| **Split Temporary Variable** | When one variable is reused for different concepts. |
| **Separate Query from Modifier** | Critical for caches, read models, and anything that mutates Mongo/Redis as a side effect of a “read.” |
| **Introduce Assertion** | Invariants (schema version, webhook assumptions, non-null IDs) after refactors. |
| **Replace Error Code with Exception** | Aligns Express/Mongo-style error paths where coded failures are fragile. |
| **Replace Exception with Test** | Where exceptions encode ordinary control flow — use judgment. |
| **Remove Assignments to Parameters** | Safer refactors when functions take `context` objects or reused arguments. |
| **Rename Method** | Low-risk clarity before bigger moves (especially internal service APIs). |

---

## 3. Tier 2 — Structural moves (after Tier 1 is comfortable)

These align with **module boundaries**, **repository vs service**, and **integration wrappers** (Alchemy, Zerion, CoinGecko, CoinDCX, etc.).

| Topic | Why it matters here |
|--------|---------------------|
| **Move Method** | Pull vendor-specific or DB-heavy pieces next to the right module (`portfolio`, `integrations/coindcx`, `utils/*`). |
| **Move Field** | State belongs with the behavior that maintains it. |
| **Extract Class** | When a service grows a “helper cluster” (merge, normalize, rate limit) that deserves its own type. |
| **Inline Class** | When an abstraction is too thin; collapse to simplify. |
| **Hide Delegate** | Useful when clarifying who owns an operation through a small wrapper. |
| **Remove Middle Man** | Avoid pointless passthrough layers; also avoid god-services that only delegate. |
| **Encapsulate Field** | Narrow direct field access as types stabilize. |
| **Encapsulate Collection** | Mongoose docs and in-memory structures (WS subscriptions, aggregators) benefit from controlled mutation. |
| **Replace Data Value with Object** | Richer domain concepts instead of primitive obsession. |
| **Replace Type Code with Class** | Safer than raw strings for domain kinds. |
| **Replace Array with Object** | Named structure instead of positional arrays in domain logic. |
| **Replace Magic Number with Symbolic Constant** | TTLs, limits, cron expressions, Redis key semantics — tie to `config` and named constants. |
| **Parameterize Method** | Reduce duplication when only a few variants differ. |
| **Introduce Parameter Object** | `context` bags (`PortfolioRequestContext`), search params, webhook envelopes. |
| **Preserve Whole Object** | Pass a cohesive object instead of flattening many fields. |
| **Replace Method with Method Object** | Long orchestrations (e.g. multi-vendor holdings build) when Extract Method is not enough. |
| **Add Parameter** | Evolution of internal APIs with explicit dependencies. |
| **Remove Parameter** | Remove unused or redundant arguments after callers stabilize. |
| **Replace Parameter with Explicit Methods** | Prefer distinct methods over a mode flag when variants are real branches. |
| **Replace Parameter with Method** | Derive values inside instead of passing them from everywhere. |

---

## 4. Tier 3 — Inheritance and hierarchy (study before applying; use sparingly)

Relevant when **generalizing** exchange connectors, stream jobs, or strategies — not for every Express `switch`.

| Topic | Why it matters here |
|--------|---------------------|
| **Replace Conditional with Polymorphism** | Good for stable strategy-shaped code (exchange poll, segment runners); avoid over-abstracting one-off handlers. |
| **Replace Type Code with State/Strategy** | Modes with shared structure and swappable behavior. |
| **Replace Type Code with Subclasses** | When variation is structural and long-lived. |
| **Extract Interface** | Seams for tests and adapters (Redis, HTTP vendors). |
| **Extract Superclass** | Shared behavior across related types — only when the protocol is stable. |
| **Extract Subclass** | Split variants without duplicating the whole type. |
| **Pull Up Method** / **Pull Up Field** / **Pull Up Constructor Body** | Shared members to a common supertype when duplication is real. |
| **Push Down Method** / **Push Down Field** | Move specialized pieces to subclasses. |
| **Collapse Hierarchy** | Remove layers that no longer earn their keep. |
| **Form Template Method** | Shared skeleton for workers/cron jobs with small, controlled variations. |
| **Replace Inheritance with Delegation** | When inheritance hides useful composition. |
| **Replace Delegation with Inheritance** | Rare; when subclassing truly *is* specialization. |
| **Tease Apart Inheritance** | When a hierarchy mixes unrelated concerns (know the smell before big edits). |

---

## 5. Tier 4 — Big-picture moves (read once; apply only with a clear design goal)

| Topic | Why it matters here |
|--------|---------------------|
| **Convert Procedural Design to Objects** | Pull logic out of procedural “scripts” and fat functions — **deliberate architecture step**, not drive-by cleanup. |
| **Extract Hierarchy** | When a domain (portfolio vs exchange vs wallet) needs explicit layers. |
| **Separate Domain from Presentation** | Keep HTTP/controller concerns out of pure domain and merge/sync math. |
| **Introduce Null Object** | Optional for “no holdings / no wallet” **if** it removes repetition without hiding real errors. |
| **Introduce Foreign Method** | Extend third-party types at call sites when you cannot change the library. |
| **Introduce Local Extension** | Wrapper types for vendor SDK shapes. |
| **Self Encapsulate Field** | Less idiomatic in modern TS; relevant for legacy getter/setter patterns around Mongoose. |
| **Substitute Algorithm** | Replace a whole approach (e.g. search ranking, merge strategy), not cosmetic edits. |
| **Replace Record with Data Class** | DTO/read-model rows that are only data carriers. |
| **Replace Constructor with Factory Method** | Complex construction (e.g. webhook payload → domain event). |
| **Hide Method** | Narrow surface on types that should not be public API. |
| **Encapsulate Downcast** | Contain unsafe `as` / casts at integration boundaries. |
| **Replace Subclass with Fields** | When subclasses add complexity without real variation. |

---

## 6. Association and object identity (study when modeling graphs, not by default)

| Topic | Notes for this codebase |
|--------|-------------------------|
| **Change Bidirectional Association to Unidirectional** | Simplify object graphs when one direction is unused. |
| **Change Unidirectional Association to Bidirectional** | Only when both directions are required and maintained consistently. |
| **Change Reference to Value** / **Change Value to Reference** | Entity vs value semantics — relevant for holdings/coin identity; easy to get wrong with Mongo documents. |

---

## 7. De-prioritize or use with extra caution

| Topic | Note |
|--------|------|
| **Duplicate Observed Data** | Usually a poor fit for server-side sync; avoid mirroring DB authority in memory casually. |
| **Introduce Null Object** | Use only where absence is a normal, safe domain state — not for masking errors. |
| **Polymorphism / inheritance tiers** | Do not introduce abstract hierarchies for one-off Express routes or single-integration quirks. |

---

## 8. Suggested reading order (minimal path)

1. **Extract Method** → **Guard Clauses** → **Decompose/Consolidate conditional** → **Separate Query from Modifier** → **Replace Temp with Query** / **Introduce Explaining Variable**.
2. **Move Method**, **Extract Class**, **Introduce Parameter Object**, **Replace Magic Number**, **Encapsulate Collection**.
3. **Replace Conditional with Polymorphism**, **State/Strategy**, **Extract Interface**, **Form Template Method** — only where you see **repeated variation**, not single `switch` branches.
4. Skim **Convert Procedural Design to Objects**, **Separate Domain from Presentation**, **Tease Apart Inheritance** before any large vertical slice or module split.

---

## 9. Cross-reference: index topics from the source list

The following Fowler refactorings appeared on the photographed index; the tiers above **prioritize** them for this backend but you can use this as a checklist against the book.

**Part 1 (alphabetical index):** Add Parameter, Change Bidirectional Association to Unidirectional, Change Reference to Value, Change Unidirectional Association to Bidirectional, Change Value to Reference, Collapse Hierarchy, Consolidate Conditional Expression, Consolidate Duplicate Conditional Fragments, Convert Procedural Design to Objects, Decompose Conditional, Duplicate Observed Data, Encapsulate Collection, Encapsulate Downcast, Encapsulate Field, Extract Class, Extract Hierarchy, Extract Interface, Extract Method, Extract Subclass, Extract Superclass, Form Template Method, Hide Delegate, Hide Method, Inline Class, Inline Method, Inline Temp, Introduce Assertion, Introduce Explaining Variable, Introduce Foreign Method, Introduce Local Extension, Introduce Null Object, Introduce Parameter Object, Move Field, Move Method, Parameterize Method, Preserve Whole Object.

**Part 2:** Pull Up Constructor Body, Pull Up Field, Pull Up Method, Push Down Field, Push Down Method, Remove Assignments to Parameters, Remove Control Flag, Remove Middle Man, Remove Parameter, Remove Setting Method, Rename Method, Replace Array with Object, Replace Conditional with Polymorphism, Replace Constructor with Factory Method, Replace Data Value with Object, Replace Delegation with Inheritance, Replace Error Code with Exception, Replace Exception with Test, Replace Inheritance with Delegation, Replace Magic Number with Symbolic Constant, Replace Method with Method Object, Replace Nested Conditional with Guard Clauses, Replace Parameter with Explicit Methods, Replace Parameter with Method, Replace Record with Data Class, Replace Subclass with Fields, Replace Temp with Query, Replace Type Code with Class, Replace Type Code with State/Strategy, Replace Type Code with Subclasses, Self Encapsulate Field, Separate Domain from Presentation, Separate Query from Modifier, Split Temporary Variable, Substitute Algorithm, Tease Apart Inheritance.

---

## 10. Operational reminders for this repo

- Prefer **small, tested steps** in portfolio, coin, news, and feature/event code paths.
- Respect **startup order** and **env flags** (`DISABLE_INLINE_TICKER_INGESTION`, etc.) when moving code out of `server.ts`.
- When changing **WebSocket** or **Redis** behavior, treat wire/cache contracts as **versioned** relative to `crypto-market` and admin clients.

*This document is a study and planning aid; pair it with existing internal architecture notes under the workspace `knowledge/` tree where applicable.*
