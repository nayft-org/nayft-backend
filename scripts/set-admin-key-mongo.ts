/**
 * Set admin key in MongoDB admin_config collection.
 * Run: cd crypto-backend && npx ts-node --transpile-only scripts/set-admin-key-mongo.ts
 */
import mongoose from 'mongoose'
import dotenv from 'dotenv'
dotenv.config()

const ADMIN_KEY = process.env.ADMIN_API_KEY || 'crypto-admin-secret-key-2024'
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27018/crypto_db'

async function main() {
  await mongoose.connect(MONGO_URI)
  const col = mongoose.connection.db!.collection('admin_config')
  await col.updateOne(
    { _id: 'admin_key' },
    { $set: { key: ADMIN_KEY, updatedAt: new Date() } },
    { upsert: true }
  )
  const doc = await col.findOne({ _id: 'admin_key' })
  console.log('Admin key stored in MongoDB admin_config:', !!doc?.key)
  await mongoose.disconnect()
}

main().catch(console.error)
