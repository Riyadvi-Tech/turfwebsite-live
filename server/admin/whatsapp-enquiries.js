import crypto from 'node:crypto'
import { getDb } from '../_lib/mongodb.js'

function sessionToken(req) {
  return req.headers.cookie?.match(/(?:^|; )turfon24_admin_session=([^;]+)/)?.[1]
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
  if (req.method !== 'GET') return res.status(405).json({ message: 'Method not allowed' })
  try {
    const db = await getDb()
    if (!await requireAdmin(req, db)) return res.status(401).json({ message: 'Admin authentication required.' })
    const enquiries = await db.collection('whatsapp_enquiries')
      .find({}, { projection: { name: 1, mobile: 1, email: 1, message: 1, status: 1, createdAt: 1, updatedAt: 1 } })
      .sort({ createdAt: -1, _id: -1 })
      .limit(100)
      .toArray()
    return res.status(200).json({ enquiries: enquiries.map((enquiry) => ({ ...enquiry, _id: String(enquiry._id) })) })
  } catch (error) {
    console.error('admin WhatsApp enquiries failed', error.message)
    return res.status(503).json({ message: 'WhatsApp enquiries are temporarily unavailable.' })
  }
}
