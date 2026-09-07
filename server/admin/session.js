import crypto from 'node:crypto'
import { getDb } from '../_lib/mongodb.js'

function sessionToken(req) {
  return req.headers.cookie?.match(
    /(?:^|; )turfon24_admin_session=([^;]+)/
  )?.[1]
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({
      message: 'Method not allowed',
    })
  }

  const raw = sessionToken(req)

  if (!raw) {
    return res.status(401).json({
      authenticated: false,
    })
  }

  const hash = crypto
    .createHash('sha256')
    .update(raw)
    .digest('hex')

  try {
    const db = await getDb()

    const session = await db.collection('admin_sessions').findOne({
      sessionTokenHash: hash,
    })

    if (!session) {
      return res.status(401).json({
        authenticated: false,
      })
    }

    // Reject expired sessions.
    if (
      session.expiresAt &&
      new Date(session.expiresAt) <= new Date()
    ) {
      await db.collection('admin_sessions').deleteOne({
        _id: session._id,
      })

      return res.status(401).json({
        authenticated: false,
      })
    }

    const admin = await db.collection('admin_users').findOne({
      _id: session.adminId,
      active: true,
    })

    const authenticated = Boolean(admin)

    return res
      .status(authenticated ? 200 : 401)
      .json({ authenticated })
  } catch (error) {
    console.error(
      'admin session check failed',
      error.message,
    )

    return res.status(503).json({
      message: 'Session check is temporarily unavailable.',
    })
  }
}