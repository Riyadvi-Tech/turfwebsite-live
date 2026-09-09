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
    const collection = db.collection('whatsapp_enquiries')
    const id = Array.isArray(req.query?.id) ? req.query.id[0] : req.query?.id
    if (req.method === 'PATCH') {
      if (!ObjectId.isValid(String(id || ''))) return res.status(400).json({ message: 'Invalid enquiry id.' })
      const requested = String(req.body?.status || '').trim().toLowerCase()
      if (requested !== 'contacted') return res.status(400).json({ message: 'Only contacted status is supported.' })
      const result = await collection.findOneAndUpdate({ _id: new ObjectId(String(id)) }, { $set: { status: 'contacted', updatedAt: new Date() } }, { returnDocument: 'after' })
      return result ? res.status(200).json({ enquiry: { ...result, _id: String(result._id) } }) : res.status(404).json({ message: 'Enquiry not found.' })
    }
    const enquiries = await collection
      .find({}, { projection: { name: 1, mobile: 1, email: 1, message: 1, status: 1, createdAt: 1, updatedAt: 1 } })
      .sort({ createdAt: -1, _id: -1 })
      .limit(100)
      .toArray()
    return res.status(200).json({
      enquiries: enquiries.map((enquiry) => {
        const rawStatus = String(enquiry.status || '').trim().toLowerCase()
        return { ...enquiry, status: rawStatus || 'new', _id: String(enquiry._id) }
      }),
    })
  } catch (error) {
    console.error('admin WhatsApp enquiries failed', error.message)
    return res.status(503).json({ message: 'WhatsApp enquiries are temporarily unavailable.' })
  }
}
