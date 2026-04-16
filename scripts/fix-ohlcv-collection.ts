#!/usr/bin/env npx ts-node
/**
 * Fixes market_ohlcv_candles collection: drops the existing time-series collection
 * so it can be recreated as a regular collection (required for upsert support).
 *
 * MongoDB time-series collections do not support updateOne/upsert.
 * Run this once if you see: "Cannot perform a non-multi update on a time-series collection"
 *
 * Usage: npm run script:fix-ohlcv
 */

import dotenv from 'dotenv';
dotenv.config();

import mongoose from 'mongoose';
import { connectDatabase } from '../src/config/database';

async function main(): Promise<void> {
  await connectDatabase();
  const db = mongoose.connection.db;
  if (!db) throw new Error('Database not connected');

  const coll = db.collection('market_ohlcv_candles');
  const exists = (await db.listCollections({ name: 'market_ohlcv_candles' }).toArray()).length > 0;

  if (exists) {
    await coll.drop();
    console.log('✅ Dropped market_ohlcv_candles collection. It will be recreated as a regular collection on next write.');
  } else {
    console.log('ℹ️  market_ohlcv_candles collection does not exist. No action needed.');
  }

  await mongoose.disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
