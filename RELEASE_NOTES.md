# Release Notes - v1.0.0

**Release Date:** February 14, 2026

## Overview

Crypto Backend API v1.0.0 is a production-ready Node.js backend supporting crypto news feeds, market data, coin profiles, wishlist, and rewards. This release establishes the core API surface and integrates with CoinGecko, CoinMarketCap, and CoinDesk.

---

## Features

### Authentication
- **User Registration & Login** – JWT-based auth with signup and login endpoints
- **Protected Routes** – `GET /api/auth/me` for current user session
- **Token Management** – Configurable JWT expiry via `JWT_EXPIRES_IN`

### Market Watch
- **Trending Coins** – `GET /api/market/trending` – Top coins by market cap
- **Top Gainers** – `GET /api/market/top-gainers` – Best 24h performers
- **Top Losers** – `GET /api/market/top-losers` – Worst 24h performers
- **Data Source** – CoinMarketCap API integration

### Coin Profile
- **Coin Details** – `GET /api/coins/:coinId` – Full coin profile with price, rank, image
- **Coin News** – `GET /api/coins/:coinId/news` – News articles related to the coin
- **CoinGecko Integration** – Primary data source for coin metadata and images
- **Demo & Pro API Support** – `COIN_GECKO_API_TYPE` env for Demo (`api.coingecko.com`) or Pro (`pro-api.coingecko.com`)
- **ID Resolution** – Supports CoinGecko IDs (e.g. `bitcoin`), symbols, and CMC numeric IDs (e.g. `1027`)

### News
- **Explore Feed** – `GET /api/news` – Latest crypto news from CoinDesk
- **Following Feed** – `GET /api/news/following` – News for followed coins (auth required)
- **News Detail** – `GET /api/news/:newsId` – Single article
- **Coin-Filtered News** – `GET /api/news?filterby=coin&coinid=:id` – News for a specific coin

### Search
- **Unified Search** – `GET /api/search?q=query` – Search coins and news from MongoDB

### Wishlist
- **Add/Remove** – `POST` and `DELETE /api/wishlist/:coinId`
- **List** – `GET /api/wishlist` – User's followed coins

### Rewards
- **View & Claim** – `GET /api/rewards`, `POST /api/rewards/claim`

---

## Tech Stack

- **Runtime:** Node.js + TypeScript
- **Framework:** Express
- **Database:** MongoDB (Mongoose)
- **Auth:** JWT
- **APIs:** CoinGecko, CoinMarketCap, CoinDesk

---

## Environment Variables

| Variable | Description |
|----------|-------------|
| `NODE_ENV` | `development` or `production` |
| `PORT` | Server port (default: 4001) |
| `MONGO_URI` | MongoDB connection string |
| `JWT_SECRET` | Secret for JWT signing |
| `JWT_EXPIRES_IN` | Token expiry (e.g. `7d`) |
| `CMC_API_KEY` | CoinMarketCap API key |
| `CMC_BASE_URL` | CoinMarketCap base URL |
| `COIN_GECKO_API_KEY` | CoinGecko API key |
| `COIN_GECKO_API_TYPE` | `demo` or `pro` (default: `demo`) |
| `COIN_DESK_API_KEY` | CoinDesk API key |
| `FRONTEND_URL` | CORS origin for frontend |

---

## Breaking Changes

None. This is the initial v1.0 release.

---

## Upgrade Notes

1. Ensure `COIN_GECKO_API_KEY` is set in `.env`
2. For Demo API keys, use `COIN_GECKO_API_TYPE=demo` (or omit; it is the default)
3. For Pro API keys, set `COIN_GECKO_API_TYPE=pro`
