import dns from 'node:dns'
import { MongoClient } from 'mongodb'
import bcrypt from 'bcryptjs'

let client
let clientPromise

dns.setServers(['8.8.8.8', '1.1.1.1'])

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

function createMockCollection(seed = []) {
  const docs = [...seed].map((doc) => ({ ...doc }))

  const collection = {
    async findOne(filter = {}, options = {}) {
      const found = docs.find((doc) => matchesFilter(doc, filter))
      if (!found) return null
      if (options && typeof options.projection === 'object') {
        const projected = {}
        Object.entries(options.projection).forEach(([field, include]) => {
          if (include === 1 && field !== '_id') projected[field] = getDeepValue(found, field)
        })
        if (Object.keys(projected).length) return projected
      }
      return { ...found }
    },

    async countDocuments(filter = {}) {
      return docs.filter((doc) => matchesFilter(doc, filter)).length
    },

    async insertOne(document) {
      const nextDoc = { ...document }
      if (!nextDoc._id) {
        nextDoc._id = `mock-${Date.now()}-${Math.random().toString(16).slice(2)}`
      }
      docs.push(nextDoc)
      return { insertedId: nextDoc._id }
    },

    async findOneAndUpdate(filter = {}, update = {}, options = {}) {
      const index = docs.findIndex((doc) => matchesFilter(doc, filter))
      if (index === -1) return null

      const nextDoc = { ...docs[index] }
      if (update && update.$set) {
        Object.entries(update.$set).forEach(([key, value]) => {
          if (key.includes('.')) {
            const ref = key.split('.').slice(0, -1).reduce((obj, part) => (obj[part] ??= {}), nextDoc)
            ref[key.split('.').at(-1)] = value
          } else {
            nextDoc[key] = value
          }
        })
      }

      docs[index] = nextDoc
      if (options && options.returnDocument === 'after') return { ...nextDoc }
      return { ...nextDoc }
    },

    async updateOne(filter = {}, update = {}) {
      const index = docs.findIndex((doc) => matchesFilter(doc, filter))
      if (index === -1) return { matchedCount: 0, modifiedCount: 0 }

      const nextDoc = { ...docs[index] }
      if (update && update.$set) {
        Object.entries(update.$set).forEach(([key, value]) => {
          nextDoc[key] = value
        })
      }
      docs[index] = nextDoc
      return { matchedCount: 1, modifiedCount: 1 }
    },

    async deleteOne(filter = {}) {
      const index = docs.findIndex((doc) => matchesFilter(doc, filter))
      if (index === -1) return { deletedCount: 0 }
      docs.splice(index, 1)
      return { deletedCount: 1 }
    },

    find(filter = {}, options = {}) {
      let items = docs.filter((doc) => matchesFilter(doc, filter))
      const cursor = {
        _items: [...items],
        sort(spec) {
          cursor._items = sortDocuments(cursor._items, spec)
          return cursor
        },
        skip(count) {
          cursor._items = cursor._items.slice(Number(count) || 0)
          return cursor
        },
        limit(count) {
          cursor._items = cursor._items.slice(0, Number(count) || cursor._items.length)
          return cursor
        },
        async toArray() {
          return [...cursor._items]
        },
      }

      if (options && options.projection) {
        cursor._items = cursor._items.map((doc) => {
          const projected = {}
          Object.entries(options.projection).forEach(([field, include]) => {
            if (include === 1 && field !== '_id') projected[field] = getDeepValue(doc, field)
          })
          return projected
        })
      }

      return cursor
    },

    aggregate() {
      return {
        async toArray() {
          return []
        },
      }
    },

    async listCollections() {
      return {
        toArray: async () => docs.map((doc) => ({ name: doc._id || 'mock-doc' })),
      }
    },
  }

  return collection
}

function createMemoryDb() {
  const mockPasswordHash = bcrypt.hashSync('Turfon24@139', 12)

  const collections = {
    admin_users: [
      {
        _id: 'mock-admin-id',
        email: 'ask@turfon24.com',
        passwordHash: mockPasswordHash,
        name: 'Admin',
        active: true,
      },
    ],
    admin_sessions: [],
    website_settings: [
      {
        key: 'main',
        businessName: 'Turfon24',
        hourlyRate: 800,
        phone: '+91 89399 89366',
        whatsapp: '+91 89399 89366',
        email: 'ask@turfon24.com',
        upiId: 'turfon24@okaxis',
        address: 'Cuddalore',
        updatedAt: new Date().toISOString(),
      },
    ],
    bookings: [],
    customers: [],
    payments: [],
    payment_sessions: [],
    extended_enquiries: [],
    whatsapp_enquiries: [],
    chatbot_conversations: [],
    password_reset_tokens: [],
  }

  return {
    collection(name) {
      if (!collections[name]) collections[name] = []
      return createMockCollection(collections[name])
    },
  }
}

async function getMongoClient() {
  if (!clientPromise) {
    const uri = process.env.MONGODB_URI

    if (!uri) {
      throw new Error('MONGODB_URI is not configured')
    }

    client = new MongoClient(uri)
    clientPromise = client.connect()
  }

  return clientPromise
}

async function getDb() {
  if (!process.env.MONGODB_URI) {
    return createMemoryDb()
  }

  try {
    const mongoClient = await getMongoClient()
    return mongoClient.db(process.env.MONGODB_DB || 'turfon24')
  } catch (error) {
    console.warn('MongoDB unavailable, using mock admin data for local development.')
    return createMemoryDb()
  }
}

export {
  getMongoClient,
  getDb,
}