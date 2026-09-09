import { getDb } from '../_lib/mongodb.js'
import { getMailer, resetUrl, classifyMailError } from '../_lib/mail.js'
import { GENERIC_RESET_MESSAGE, tokenPair, validEmail } from '../_lib/security.js'

function getRequestIp(req) {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || 'unknown'
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ message: 'Method not allowed' })
  const email = String(req.body?.email || '').trim().toLowerCase()
  if (!validEmail(email)) return res.status(400).json({ message: 'Enter a valid email address.' })
  try {
    const db = await getDb()
    const ip = getRequestIp(req)
    const since = new Date(Date.now() - 15 * 60 * 1000)
    const recent = await db.collection('password_reset_tokens').countDocuments({
      createdAt: { $gt: since },
      $or: [{ requestIp: ip }, { adminEmail: email }],
    })
    if (recent >= 5) return res.status(200).json({ message: GENERIC_RESET_MESSAGE })
    const admin = await db.collection('admin_users').findOne({ email, active: true }, { projection: { email: 1 } })
    if (admin) {
      const { rawToken, tokenHash } = tokenPair()
      const now = new Date()
      await db.collection('password_reset_tokens').updateMany({ adminId: admin._id, usedAt: null }, { $set: { usedAt: now } })
      await db.collection('password_reset_tokens').insertOne({
        adminId: admin._id,
        tokenHash,
        createdAt: now,
        expiresAt: new Date(now.getTime() + 30 * 60 * 1000),
        usedAt: null,
        requestIp: ip,
        adminEmail: admin.email,
        userAgent: req.headers['user-agent'] || null,
      })
      const url = resetUrl(rawToken, req)
      const recipient = (process.env.RESET_DEST_EMAIL || '').trim() || admin.email
      try {
        await getMailer().sendMail({ from: process.env.MAIL_FROM, to: recipient, subject: 'Turfon24 Admin Password Reset', text: `We received a request to reset your Turfon24 admin password.\n\nReset your password here: ${url}\n\nThis link expires in 30 minutes and can only be used once. If you did not request this, ignore this email.`, html: `<p>We received a request to reset your Turfon24 admin password.</p><p><a href="${url}">Reset admin password</a></p><p>This link expires in 30 minutes and can only be used once. If you did not request this, you can safely ignore this email.</p><p>Turfon24</p>` })
      } catch (mailError) {
        await db.collection('password_reset_tokens').updateOne({ tokenHash }, { $set: { usedAt: now } })
        throw mailError
      }
    }
    return res.status(200).json({ message: GENERIC_RESET_MESSAGE })
  } catch (error) {
    const mailCode = classifyMailError(error)
    const code = mailCode !== 'MAIL_OTHER' ? mailCode : 'DATABASE_ERROR'
    console.error('forgot-password failed', JSON.stringify({ code }))
    return res.status(503).json({ code, message: 'Unable to send the reset email right now. Please try again later.' })
  }
}
