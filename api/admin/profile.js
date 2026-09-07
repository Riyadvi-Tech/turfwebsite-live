import bcrypt from 'bcryptjs'
import crypto from 'node:crypto'
import { getDb } from '../_lib/mongodb.js'
import { PASSWORD_MIN_LENGTH } from '../_lib/security.js'

function sessionToken(req) {
  return req.headers.cookie?.match(/(?:^|; )turfon24_admin_session=([^;]+)/)?.[1]
}

async function currentAdmin(req, db) {
  const raw = sessionToken(req)
  if (!raw) return null
  const sessionTokenHash = crypto.createHash('sha256').update(raw).digest('hex')
  const session = await db.collection('admin_sessions').findOne({ sessionTokenHash })
  if (!session || (session.expiresAt && new Date(session.expiresAt) <= new Date())) return null
  return db.collection('admin_users').findOne({ _id: session.adminId, active: true })
}

function publicProfile(admin) {
  return { name: admin.name || 'Admin', email: admin.email }
}

function validEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

export default async function handler(req, res) {
  if (!['GET', 'PATCH'].includes(req.method)) return res.status(405).json({ message: 'Method not allowed' })

  try {
    const db = await getDb()
    const admin = await currentAdmin(req, db)
    if (!admin) return res.status(401).json({ message: 'Admin authentication required.' })

    if (req.method === 'GET') return res.status(200).json({ profile: publicProfile(admin) })

    const email = String(req.body?.email || '').trim().toLowerCase()
    const name = String(req.body?.name || '').trim()
    const newPassword = String(req.body?.newPassword || '')
    if (!validEmail(email)) return res.status(400).json({ message: 'Enter a valid email address.' })
    if (name.length > 120) return res.status(400).json({ message: 'Name is too long.' })
    if (newPassword && newPassword.length < PASSWORD_MIN_LENGTH) return res.status(400).json({ message: `Password must be at least ${PASSWORD_MIN_LENGTH} characters.` })

    const duplicate = await db.collection('admin_users').findOne({ email, _id: { $ne: admin._id }, active: true }, { projection: { _id: 1 } })
    if (duplicate) return res.status(409).json({ message: 'That email address is already in use.' })

    const updates = { email, name: name || 'Admin', updatedAt: new Date() }
    if (newPassword) updates.passwordHash = await bcrypt.hash(newPassword, 12)
    await db.collection('admin_users').updateOne({ _id: admin._id }, { $set: updates })
    return res.status(200).json({ profile: publicProfile({ ...admin, ...updates }) })
  } catch (error) {
    console.error('admin profile failed', error.message)
    return res.status(503).json({ message: 'Unable to update the admin profile right now.' })
  }
}
