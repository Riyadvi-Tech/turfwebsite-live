import bcrypt from 'bcryptjs'
import { getDb } from '../_lib/mongodb.js'
import { hashToken, PASSWORD_MIN_LENGTH } from '../_lib/security.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({
      message: 'Method not allowed',
    })
  }

  const token = String(req.body?.token || '')
  const newPassword = String(req.body?.newPassword || '')

  if (!/^[a-f0-9]{64}$/.test(token)) {
    return res.status(400).json({
      message: 'Invalid password reset link.',
    })
  }

  if (newPassword.length < PASSWORD_MIN_LENGTH) {
    return res.status(400).json({
      message: `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`,
    })
  }

  try {
    const db = await getDb()
    const tokenHash = hashToken(token)

    const reset = await db.collection('password_reset_tokens').findOne({
      tokenHash,
    })

    if (!reset) {
      return res.status(400).json({
        message: 'Invalid password reset link.',
      })
    }

    if (reset.usedAt) {
      return res.status(400).json({
        message: 'This password reset link has already been used.',
      })
    }

    if (
      reset.expiresAt &&
      new Date(reset.expiresAt) <= new Date()
    ) {
      return res.status(400).json({
        message:
          'This password reset link has expired. Please request a new reset link.',
      })
    }

    const passwordHash = await bcrypt.hash(newPassword, 12)
    const now = new Date()

    const adminResult = await db.collection('admin_users').updateOne(
      {
        _id: reset.adminId,
        active: true,
      },
      {
        $set: {
          passwordHash,
          updatedAt: now,
        },
      },
    )

    if (!adminResult.matchedCount) {
      return res.status(400).json({
        message: 'Unable to update the password.',
      })
    }

    await db.collection('password_reset_tokens').updateOne(
      {
        _id: reset._id,
      },
      {
        $set: {
          usedAt: now,
        },
      },
    )

    await db.collection('admin_sessions').deleteMany({
      adminId: reset.adminId,
    })

    return res.status(200).json({
      message: 'Password updated successfully.',
    })
  } catch (error) {
    console.error(
      'reset-password failed',
      error.message,
    )

    return res.status(503).json({
      message:
        'Unable to update the password right now. Please try again later.',
    })
  }
}