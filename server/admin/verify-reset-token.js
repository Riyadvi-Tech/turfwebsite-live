import { getDb } from '../_lib/mongodb.js'
import { hashToken } from '../_lib/security.js'

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ message: 'Method not allowed' })
  const token = String(req.query?.token || '')
  if (!/^[a-f0-9]{64}$/.test(token)) return res.status(400).json({ valid: false, reason: 'invalid' })
  try {
    const db = await getDb()
    const reset = await db.collection('password_reset_tokens').findOne({ tokenHash: hashToken(token) })
    if (!reset) return res.status(200).json({ valid: false, reason: 'invalid' })
    const status = reset.usedAt ? 'used' : reset.expiresAt && new Date(reset.expiresAt) <= new Date() ? 'expired' : 'valid'
    return res.status(200).json(status === 'valid' ? { valid: true } : { valid: false, reason: status })
  } catch (error) {
    console.error('verify-reset-token failed', error.message)
    return res.status(503).json({ valid: false, reason: 'unavailable' })
  }
}
