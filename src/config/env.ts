import dotenv from 'dotenv';

dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '4001', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  mongoUri: process.env.MONGO_URI || 'mongodb://localhost:27018/crypto_db',
  jwtSecret: process.env.JWT_SECRET || 'super_secret_key_change_later',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  cmcApiKey: process.env.CMC_API_KEY || '7c5caaa1d15946799fdc96a8a12ad759',
  cmcBaseUrl: process.env.CMC_BASE_URL || 'https://pro-api.coinmarketcap.com',
  coindeskApiKey: process.env.COIN_DESK_API_KEY || '',
  coindeskBaseUrl: process.env.COIN_DESK_BASE_URL || 'https://data-api.coindesk.com',
  coinGeckoApiKey: process.env.COIN_GECKO_API_KEY || '',
  coinGeckoApiType: (process.env.COIN_GECKO_API_TYPE || 'demo').toLowerCase() as 'demo' | 'pro',
  coinGeckoBaseUrl:
    process.env.COIN_GECKO_BASE_URL ||
    (process.env.COIN_GECKO_API_TYPE?.toLowerCase() === 'pro'
      ? 'https://pro-api.coingecko.com/api/v3'
      : 'https://api.coingecko.com/api/v3'),
  frontendUrls: (process.env.FRONTEND_URL || 'http://localhost:8083')
    .split(',')
    .map((u) => u.trim()),
};

