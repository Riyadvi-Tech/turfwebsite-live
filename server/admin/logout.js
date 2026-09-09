import crypto from 'node:crypto'
import { getDb } from '../_lib/mongodb.js'
import { parseAdminSessionToken } from '../_lib/cookies.js'

function sessionToken(req) {
  return parseAdminSessionToken(req)
}

function clearSessionCookie() {
  return `turfon24_admin_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' })
  }

  res.setHeader('Set-Cookie', clearSessionCookie())
  const raw = sessionToken(req)
  if (!raw) return res.status(200).json({ ok: true })

  try {
    const hash = crypto.createHash('sha256').update(raw).digest('hex')
    const db = await getDb()
    await db.collection('admin_sessions').deleteOne({ sessionTokenHash: hash })
    return res.status(200).json({ ok: true })
  } catch (error) {
    console.error('admin logout failed', error.message)
    return res.status(503).json({ message: 'Logout is temporarily unavailable.' })
  }
}
