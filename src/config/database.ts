import mongoose from 'mongoose';
import { config } from './env';

export const connectDatabase = async (): Promise<void> => {
  try {
    const { mongoUri } = config;
    const startedAt = Date.now();
    await mongoose.connect(mongoUri, {
      maxPoolSize: 50,
      minPoolSize: 5,
      socketTimeoutMS: config.mongoSocketTimeoutMs,
      serverSelectionTimeoutMS: config.mongoServerSelectionTimeoutMs,
      connectTimeoutMS: config.mongoConnectTimeoutMs,
      compressors: ['zlib'],
      retryReads: true,
      retryWrites: true,
    });
    console.log('✅ MongoDB connected successfully');
    console.log(`⏱️ MongoDB connection established after ${Date.now() - startedAt}ms`);
    console.log(
      `📊 Connection pool: min=5, max=50; socketTimeoutMS=${config.mongoSocketTimeoutMs} serverSelectionMS=${config.mongoServerSelectionTimeoutMs}`
    );
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    process.exit(1);
  }
};

