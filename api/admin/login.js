import bcrypt from 'bcryptjs'
import crypto from 'node:crypto'
import { getDb } from '../_lib/mongodb.js'

function cookie(name, value, maxAge) {
  return `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' })
  }

  const email = String(req.body?.email || '').trim().toLowerCase()
  const password = String(req.body?.password || '')

  if (!email || !password) {
    return res.status(400).json({
      message: 'Email and password are required.',
    })
  }

  if (!process.env.MONGODB_URI) {
    const mockEmail = 'ask@turfon24.com'
    const mockPassword = 'Turfon24@139'

    if (email === mockEmail && password === mockPassword) {
      const rawSession = crypto.randomBytes(32).toString('hex')
      res.setHeader(
        'Set-Cookie',
        cookie(
          'turfon24_admin_session',
          rawSession,
          60 * 60 * 8,
        ),
      )
      return res.status(200).json({ ok: true, mock: true })
    }

    return res.status(401).json({
      message: 'Incorrect email or password.',
    })
  }

  try {
    const db = await getDb()

    const admin = await db.collection('admin_users').findOne({
      email,
      active: true,
    })

    if (!admin) {
      return res.status(401).json({
        message: 'Incorrect email or password.',
      })
    }

    const valid = await bcrypt.compare(
      password,
      admin.passwordHash,
    )

    if (!valid) {
      return res.status(401).json({
        message: 'Incorrect email or password.',
      })
    }

    const rawSession = crypto.randomBytes(32).toString('hex')
    const hash = crypto
      .createHash('sha256')
      .update(rawSession)
      .digest('hex')

    const now = new Date()
    const expiresAt = new Date(
      now.getTime() + 8 * 60 * 60 * 1000,
    )

    await db.collection('admin_sessions').insertOne({
      adminId: admin._id,
      sessionTokenHash: hash,
      createdAt: now,
      expiresAt,
    })

    res.setHeader(
      'Set-Cookie',
      cookie(
        'turfon24_admin_session',
        rawSession,
        60 * 60 * 8,
      ),
    )

    return res.status(200).json({ ok: true })
  } catch (error) {
    console.error(
      'admin login failed',
      error.message,
    )

    return res.status(503).json({
      code: 'DATABASE_ERROR',
      message: 'Login is temporarily unavailable.',
    })
  }
}