import crypto from 'node:crypto'
import { getDb } from '../_lib/mongodb.js'

const SETTINGS_FIELDS = ['businessName', 'hourlyRate', 'phone', 'whatsapp', 'email', 'upiId', 'address']

function sessionToken(req) {
  return req.headers.cookie?.match(/(?:^|; )turfon24_admin_session=([^;]+)/)?.[1]
}

async function requireAdmin(req, db) {
  const raw = sessionToken(req)
  if (!raw) return false
  const sessionTokenHash = crypto.createHash('sha256').update(raw).digest('hex')
  const session = await db.collection('admin_sessions').findOne({ sessionTokenHash })
  const expiresAt = session?.expiresAt ? new Date(session.expiresAt) : null
  if (!session || !expiresAt || Number.isNaN(expiresAt.getTime()) || expiresAt <= new Date()) return false
  const admin = await db.collection('admin_users').findOne({ _id: session.adminId, active: true }, { projection: { _id: 1 } })
  return Boolean(admin)
}

function safeSettings(settings) {
  return {
    key: 'main',
    businessName: settings.businessName || 'Turfon24',
    hourlyRate: Number(settings.hourlyRate || 800),
    phone: settings.phone || '',
    whatsapp: settings.whatsapp || '',
    email: settings.email || '',
    upiId: settings.upiId || settings.upi || '',
    address: settings.address || '',
    updatedAt: settings.updatedAt || null,
  }
}

function validate(body) {
  const updates = {}
  for (const field of SETTINGS_FIELDS) {
    if (body[field] !== undefined) updates[field] = String(body[field]).trim()
  }
  if (body.hourlyRate !== undefined && (!Number.isFinite(Number(body.hourlyRate)) || Number(body.hourlyRate) <= 0)) throw new Error('Hourly rate must be a positive number.')
  if (updates.businessName !== undefined && (!updates.businessName || updates.businessName.length > 120)) throw new Error('Invalid business name.')
  for (const field of ['phone', 'whatsapp', 'upiId', 'address']) {
    if (updates[field] !== undefined && updates[field].length > 200) throw new Error(`Invalid ${field}.`)
  }
  if (updates.email !== undefined && updates.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(updates.email)) throw new Error('Invalid email.')
  return updates
}

export default async function handler(req, res) {
  if (!['GET', 'PATCH'].includes(req.method)) return res.status(405).json({ message: 'Method not allowed' })
  try {
    const db = await getDb()
    if (!await requireAdmin(req, db)) return res.status(401).json({ message: 'Admin authentication required.' })
    const collection = db.collection('website_settings')

    if (req.method === 'GET') {
      const settings = await collection.findOne({ key: 'main' }, { projection: { _id: 0, key: 1, businessName: 1, hourlyRate: 1, phone: 1, whatsapp: 1, email: 1, upiId: 1, upi: 1, address: 1, updatedAt: 1 } })
      if (!settings) return res.status(404).json({ message: 'Website settings are not initialized.' })
      return res.status(200).json({ settings: safeSettings(settings) })
    }

    const updates = validate(req.body || {})
    const result = await collection.findOneAndUpdate(
      { key: 'main' },
      { $set: { ...updates, updatedAt: new Date() } },
      { returnDocument: 'after', projection: { _id: 0, key: 1, businessName: 1, hourlyRate: 1, phone: 1, whatsapp: 1, email: 1, upiId: 1, upi: 1, address: 1, updatedAt: 1 } },
    )
    if (!result) return res.status(404).json({ message: 'Website settings are not initialized.' })
    return res.status(200).json({ settings: safeSettings(result) })
  } catch (error) {
    if (/^(Hourly rate|Invalid )/.test(error.message)) return res.status(400).json({ message: error.message })
    console.error('admin settings failed', error.message)
    return res.status(503).json({ message: 'Website settings are temporarily unavailable.' })
  }
}
