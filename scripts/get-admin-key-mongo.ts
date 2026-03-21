/**
 * Get admin key from MongoDB admin_config collection.
 * Run: cd crypto-backend && npx ts-node --transpile-only scripts/get-admin-key-mongo.ts
 */
import mongoose from 'mongoose'
import dotenv from 'dotenv'
dotenv.config()

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27018/crypto_db'

async function main() {
  await mongoose.connect(MONGO_URI)
  const doc = await mongoose.connection.db!
    .collection('admin_config')
    .findOne({ _id: 'admin_key' })
  if (doc?.key) {
    console.log('ADMIN_API_KEY:', doc.key)
  } else {
    console.log('No admin key found. Run set-admin-key-mongo.ts first.')
  }
  await mongoose.disconnect()
}

main().catch(console.error)
