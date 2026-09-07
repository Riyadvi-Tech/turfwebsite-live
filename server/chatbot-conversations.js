import { ObjectId } from 'mongodb'
import { getDb } from './_lib/mongodb.js'

function fail(res, status, message) {
  return res.status(status).json({ success: false, message })
}

function normalizeMobile(value) {
  const mobile = String(value || '').replace(/\D/g, '')
  if (!/^\d{10,15}$/.test(mobile)) throw new Error('A valid mobile number is required.')
  return mobile
}

function normalizeEmail(value) {
  const email = String(value || '').trim().toLowerCase()
  if (!email || email.length > 200 || !/^\S+@\S+\.\S+$/.test(email)) throw new Error('A valid email address is required.')
  return email
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return fail(res, 405, 'Method not allowed')

  try {
    const name = String(req.body?.name || '').trim()
    const mobile = normalizeMobile(req.body?.mobile || req.body?.phone)
    const email = normalizeEmail(req.body?.email)
    const message = String(req.body?.message || '').trim()
    if (!name || name.length > 120) throw new Error('A valid name is required.')
    if (!message || message.length > 2000) throw new Error('A valid message is required.')

    const db = await getDb()
    const now = new Date()
    const conversationId = String(req.body?.conversationId || '').trim()
    if (conversationId) {
      if (!ObjectId.isValid(conversationId)) return fail(res, 400, 'Invalid conversation id.')
      const result = await db.collection('chatbot_conversations').updateOne(
        { _id: new ObjectId(conversationId), mobile, email },
        {
          $push: { messages: { role: 'user', message, createdAt: now } },
          $set: { updatedAt: now, lastMessage: message },
        },
      )
      if (!result.matchedCount) return fail(res, 404, 'Chatbot conversation not found.')
      return res.status(200).json({ success: true, conversationId, status: 'new' })
    }

    const result = await db.collection('chatbot_conversations').insertOne({
      name,
      mobile,
      email,
      messages: [{ role: 'user', message, createdAt: now }],
      lastMessage: message,
      status: 'new',
      createdAt: now,
      updatedAt: now,
    })
    return res.status(201).json({ success: true, conversationId: String(result.insertedId), status: 'new' })
  } catch (error) {
    if (/^A valid /.test(error.message)) return fail(res, 400, error.message)
    console.error('chatbot conversation persistence failed', error.message)
    return fail(res, 503, 'Unable to save the chatbot conversation right now.')
  }
}
