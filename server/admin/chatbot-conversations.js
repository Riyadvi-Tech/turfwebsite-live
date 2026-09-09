import crypto from 'node:crypto'
import { ObjectId } from 'mongodb'
import { getDb } from '../_lib/mongodb.js'
import { parseAdminSessionToken } from '../_lib/cookies.js'

function sessionToken(req) {
  return parseAdminSessionToken(req)
}

async function requireAdmin(req, db) {
  const raw = sessionToken(req)
  if (!raw) return false
  const hash = crypto.createHash('sha256').update(raw).digest('hex')
  const session = await db.collection('admin_sessions').findOne({ sessionTokenHash: hash })
  if (!session || (session.expiresAt && new Date(session.expiresAt) <= new Date())) return false
  const admin = await db.collection('admin_users').findOne({ _id: session.adminId, active: true }, { projection: { _id: 1 } })
  return Boolean(admin)
}

export default async function handler(req, res) {
  if (!['GET', 'PATCH'].includes(req.method)) return res.status(405).json({ message: 'Method not allowed' })
  try {
    const db = await getDb()
    if (!await requireAdmin(req, db)) return res.status(401).json({ message: 'Admin authentication required.' })
    const collection = db.collection('chatbot_conversations')
    const id = Array.isArray(req.query?.id) ? req.query.id[0] : req.query?.id
    if (req.method === 'PATCH') {
      if (!ObjectId.isValid(String(id || ''))) return res.status(400).json({ message: 'Invalid conversation id.' })
      const requested = String(req.body?.status || '').trim().toLowerCase()
      if (requested !== 'contacted') return res.status(400).json({ message: 'Only contacted status is supported.' })
      const result = await collection.findOneAndUpdate({ _id: new ObjectId(String(id)) }, { $set: { status: 'contacted', updatedAt: new Date() } }, { returnDocument: 'after' })
      return result ? res.status(200).json({ conversation: { ...result, _id: String(result._id) } }) : res.status(404).json({ message: 'Conversation not found.' })
    }
    const conversations = await collection
      .find({}, { projection: { name: 1, mobile: 1, email: 1, messages: 1, lastMessage: 1, status: 1, createdAt: 1, updatedAt: 1 } })
      .sort({ updatedAt: -1, _id: -1 })
      .limit(100)
      .toArray()
    return res.status(200).json({
      conversations: conversations.map((conversation) => {
        const rawStatus = String(conversation.status || '').trim().toLowerCase()
        return { ...conversation, status: rawStatus || 'new', _id: String(conversation._id) }
      }),
    })
  } catch (error) {
    console.error('admin chatbot conversations failed', error.message)
    return res.status(503).json({ message: 'Chatbot conversations are temporarily unavailable.' })
  }
}
