import mongoose from 'mongoose';
import { config } from './env';

export const connectDatabase = async (): Promise<void> => {
  try {
    const mongoUri = config.mongoUri;
    await mongoose.connect(mongoUri, {
      maxPoolSize: 50,           // Max connections in pool
      minPoolSize: 10,           // Min connections to keep warm
      socketTimeoutMS: 45000,    // Close sockets after 45s of inactivity
      serverSelectionTimeoutMS: 5000,  // Timeout for server selection
      compressors: ['zlib'],     // Enable compression to reduce network I/O
    });
    console.log('✅ MongoDB connected successfully');
    console.log(`📊 Connection pool: min=${10}, max=${50}`);
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    process.exit(1);
  }
};

