import { loadEnvFile } from 'node:process'
import dns from 'node:dns'
import { getDb, getMongoClient } from '../server/_lib/mongodb.js'

try {
  loadEnvFile('.env')
} catch (error) {
  if (error.code !== 'ENOENT') throw error
}

dns.setServers(['8.8.8.8', '1.1.1.1'])

const collectionNames = [
  'admin_users',
  'admin_sessions',
  'password_reset_tokens',
  'payment_sessions',
  'bookings',
  'customers',
  'extended_enquiries',
  'payments',
  'website_settings',
  'notifications',
  'whatsapp_enquiries',
  'chatbot_conversations',
]

const indexes = {
  admin_users: [
    { key: { email: 1 }, options: { unique: true, name: 'email_unique' } },
  ],
  admin_sessions: [
    { key: { sessionTokenHash: 1 }, options: { unique: true, name: 'session_token_hash_unique' } },
    { key: { expiresAt: 1 }, options: { expireAfterSeconds: 0, name: 'expires_at_ttl' } },
  ],
  password_reset_tokens: [
    { key: { tokenHash: 1 }, options: { unique: true, name: 'token_hash_unique' } },
    { key: { expiresAt: 1 }, options: { expireAfterSeconds: 0, name: 'expires_at_ttl' } },
  ],
  payment_sessions: [
    { key: { reference: 1 }, options: { unique: true, name: 'reference_unique' } },
    { key: { status: 1 }, options: { name: 'status' } },
    { key: { createdAt: 1 }, options: { name: 'created_at' } },
    { key: { expiresAt: 1 }, options: { name: 'expires_at' } },
  ],
  bookings: [
    { key: { mobile: 1 }, options: { name: 'mobile' } },
    { key: { date: 1 }, options: { name: 'date' } },
    { key: { date: 1, time: 1 }, options: { name: 'date_time' } },
    { key: { paymentReference: 1 }, options: { name: 'payment_reference' } },
    { key: { draftReference: 1 }, options: { unique: true, sparse: true, name: 'draft_reference_unique' } },
    { key: { bookingStatus: 1 }, options: { name: 'booking_status' } },
    { key: { createdAt: 1 }, options: { name: 'created_at' } },
  ],
  booking_drafts: [
    { key: { draftReference: 1 }, options: { unique: true, name: 'draft_reference_unique' } },
    { key: { updatedAt: 1 }, options: { name: 'updated_at' } },
  ],
  customers: [
    { key: { mobile: 1 }, options: { unique: true, name: 'mobile_unique' } },
  ],
  extended_enquiries: [
    { key: { mobile: 1 }, options: { name: 'mobile' } },
    { key: { startDate: 1 }, options: { name: 'start_date' } },
    { key: { endDate: 1 }, options: { name: 'end_date' } },
    { key: { status: 1 }, options: { name: 'status' } },
    { key: { createdAt: 1 }, options: { name: 'created_at' } },
  ],
  payments: [
    { key: { paymentReference: 1 }, options: { unique: true, name: 'payment_reference_unique' } },
    { key: { bookingId: 1 }, options: { name: 'booking_id' } },
    { key: { status: 1 }, options: { name: 'status' } },
    { key: { createdAt: 1 }, options: { name: 'created_at' } },
  ],
  website_settings: [
    { key: { key: 1 }, options: { unique: true, name: 'key_unique' } },
  ],
  notifications: [
    { key: { read: 1 }, options: { name: 'read' } },
    { key: { createdAt: 1 }, options: { name: 'created_at' } },
  ],
  whatsapp_enquiries: [
    { key: { mobile: 1 }, options: { name: 'mobile' } },
    { key: { status: 1 }, options: { name: 'status' } },
    { key: { createdAt: 1 }, options: { name: 'created_at' } },
  ],
  chatbot_conversations: [
    { key: { sessionId: 1 }, options: { unique: true, name: 'session_id_unique' } },
    { key: { mobile: 1 }, options: { name: 'mobile' } },
    { key: { createdAt: 1 }, options: { name: 'created_at' } },
  ],
}

function sameKey(left, right) {
  return JSON.stringify(left) === JSON.stringify(right)
}

async function ensureCollection(db, name) {
  const exists = await db.listCollections({ name }, { nameOnly: true }).hasNext()
  if (exists) return 'found'
  await db.createCollection(name)
  return 'created'
}

async function ensureIndex(collection, definition) {
  const existing = await collection.listIndexes().toArray()
  const matchingKey = existing.find((index) => sameKey(index.key, definition.key))
  if (matchingKey) return `found (${matchingKey.name})`

  try {
    const name = await collection.createIndex(definition.key, definition.options)
    return `created (${name})`
  } catch (error) {
    if (error.code === 85 || error.code === 86) {
      return 'found (compatible existing index)'
    }
    throw error
  }
}

async function main() {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is not configured')

  const db = await getDb()
  const collectionResults = {}
  const indexResults = {}

  for (const name of collectionNames) {
    collectionResults[name] = await ensureCollection(db, name)
  }

  for (const [name, definitions] of Object.entries(indexes)) {
    const collection = db.collection(name)
    indexResults[name] = []
    for (const definition of definitions) {
      indexResults[name].push({
        key: Object.keys(definition.key).join('+'),
        result: await ensureIndex(collection, definition),
      })
    }
  }

  const settings = db.collection('website_settings')
  const existingSettings = await settings.findOne({ key: 'main' }, { projection: { _id: 1 } })
  let websiteSettings = 'found'
  if (!existingSettings) {
    await settings.insertOne({
      key: 'main',
      hourlyRate: 800,
      businessName: 'Turfon24',
      updatedAt: new Date(),
    })
    websiteSettings = 'initialized'
  }

  console.log(JSON.stringify({
    database: process.env.MONGODB_DB || 'turfon24',
    collections: collectionResults,
    indexes: indexResults,
    websiteSettings,
  }, null, 2))
}

let client
try {
  client = await getMongoClient()
  await main()
  console.log('MongoDB initialization succeeded.')
} catch (error) {
  console.error(`MongoDB initialization failed: ${error.message}`)
  process.exitCode = 1
} finally {
  await client?.close()
}
