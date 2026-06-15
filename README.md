# Crypto Backend API

Production-ready crypto backend supporting news feed, market watch, coin profiles, wishlist, and rewards.

<!-- CI pipeline trigger -->

## Tech Stack

- Node.js + TypeScript
- Express
- MongoDB (Mongoose)
- Docker Compose
- JWT Authentication
- CoinMarketCap API

## Setup

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Start MongoDB**:
   ```bash
   docker-compose up -d
   ```

3. **Configure environment**:
   - Create a `.env` file in the root directory with:
     ```
     NODE_ENV=development
     PORT=4001
     MONGO_URI=mongodb://localhost:27018/crypto_db
     JWT_SECRET=super_secret_key_change_later
     JWT_EXPIRES_IN=7d
     CMC_API_KEY=YOUR_COINMARKETCAP_API_KEY
     CMC_BASE_URL=https://pro-api.coinmarketcap.com
     ```
   - Replace `YOUR_COINMARKETCAP_API_KEY` with your actual API key from [CoinMarketCap](https://coinmarketcap.com/api/)

4. **Run development server**:
   ```bash
   npm run dev
   ```

## API Endpoints

### Authentication
- `POST /api/auth/signup` - Register new user
- `POST /api/auth/login` - Login user
- `GET /api/auth/me` - Get current user (protected)

### Market
- `GET /api/market/trending` - Get trending coins
- `GET /api/market/top-gainers` - Get top gainers
- `GET /api/market/top-losers` - Get top losers

### Coins
- `GET /api/coins/:coinId` - Get coin profile
- `GET /api/coins/:coinId/news` - Get coin news

### News
- `GET /api/news` - Get all news
- `GET /api/news/following` - Get following news (protected)
- `GET /api/news/:newsId` - Get news detail

### Search
- `GET /api/search?q=bitcoin` - Search coins and news

### Wishlist
- `POST /api/wishlist/:coinId` - Add to wishlist (protected)
- `DELETE /api/wishlist/:coinId` - Remove from wishlist (protected)
- `GET /api/wishlist` - Get wishlist (protected)

### Rewards
- `GET /api/rewards` - Get rewards (protected)
- `POST /api/rewards/claim` - Claim rewards (protected)

