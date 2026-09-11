import dns from 'node:dns'
import { MongoClient } from 'mongodb'

let client
let clientPromise

if (process.env.VERCEL !== '1') {
  dns.setServers(['8.8.8.8', '1.1.1.1'])
}

function getDeepValue(obj, path) {
  return path.split('.').reduce((value, key) => value?.[key], obj)
}

function matchValue(actual, expected) {
  if (expected && typeof expected === 'object' && !Array.isArray(expected)) {
    if (expected.$regex) {
      return new RegExp(expected.$regex, expected.$options || 'i').test(String(actual ?? ''))
    }
    if (expected.$in) return expected.$in.includes(actual)
    if (expected.$ne) return actual !== expected.$ne
    if (expected.$gte !== undefined) return actual >= expected.$gte
    if (expected.$gt !== undefined) return actual > expected.$gt
    if (expected.$lte !== undefined) return actual <= expected.$lte
    if (expected.$lt !== undefined) return actual < expected.$lt
    if (expected.$exists !== undefined) {
      const exists = actual !== undefined && actual !== null
      return exists === expected.$exists
    }
    return false
  }

  return actual === expected
}

function matchesFilter(doc, filter = {}) {
  if (!filter || Object.keys(filter).length === 0) return true

  return Object.entries(filter).every(([key, expected]) => {
    if (key === '$or' || key === '$and') {
      return Array.isArray(expected)
        ? (key === '$or' ? expected.some((entry) => matchesFilter(doc, entry)) : expected.every((entry) => matchesFilter(doc, entry)))
        : true
    }

    if (key === '$expr') return true

    const actual = getDeepValue(doc, key)
    return matchValue(actual, expected)
  })
}

function sortDocuments(items, sort = {}) {
  const entries = Object.entries(sort)
  if (!entries.length) return items

  return [...items].sort((left, right) => {
    for (const [field, direction] of entries) {
      const leftValue = getDeepValue(left, field)
      const rightValue = getDeepValue(right, field)
      if (leftValue === rightValue) continue
      const result = leftValue > rightValue ? 1 : -1
      return direction === -1 ? result * -1 : result
    }
    return 0
  })
}

async function getMongoClient() {
  if (!clientPromise) {
    const uri = process.env.MONGODB_URI

    if (!uri) {
      throw new Error('MONGODB_URI is not configured')
    }

    client = new MongoClient(uri, { serverSelectionTimeoutMS: 6000, connectTimeoutMS: 6000 })
    clientPromise = client.connect().catch(async (error) => {
      if (!/querySrv|ECONNREFUSED|EAI_AGAIN|ENOTFOUND/i.test(error.message || '')) throw error

      dns.setServers(['8.8.8.8', '1.1.1.1'])
      client = new MongoClient(uri, { serverSelectionTimeoutMS: 6000, connectTimeoutMS: 6000 })
      return client.connect()
    }).catch((error) => {
      clientPromise = undefined
      client = undefined
      throw error
    })
  }

  return clientPromise
}

async function getDb() {
  if (!process.env.MONGODB_URI) {
    throw new Error('MONGODB_URI is not configured')
  }

  try {
    const mongoClient = await getMongoClient()
    return mongoClient.db(process.env.MONGODB_DB || 'turfon24')
  } catch (error) {
    console.error('MongoDB connection failed:', error.message)
    const databaseError = new Error('Database temporarily unavailable.')
    databaseError.code = 'DATABASE_ERROR'
    databaseError.cause = error
    throw databaseError
  }
}

export {
  getMongoClient,
  getDb,
}