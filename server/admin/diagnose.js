import { getDb } from '../_lib/mongodb.js'
import { getMailer, getMailConfig } from '../_lib/mail.js'

function presence(...names) {
  const out = {}
  for (const name of names) out[name] = Boolean(process.env[name])
  return out
}

export default async function handler(_req, res) {
  const mailConfig = getMailConfig()
  const env = presence('MONGODB_URI', 'MONGODB_DB', 'APP_URL', 'SMTP_FROM', 'MAIL_FROM', 'SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'SMTP_PASSWORD', 'SMTP_SECURE', 'RESET_DEST_EMAIL')

  const database = { configured: env.MONGODB_URI, databaseNameConfigured: env.MONGODB_DB, reachable: false, collections: {}, error: null }
  if (env.MONGODB_URI) {
    try {
      const db = await getDb()
      await db.command({ ping: 1 })
      database.reachable = true
      const collections = await db.listCollections({ name: { $in: ['admin_users', 'admin_sessions', 'password_reset_tokens'] } }).toArray()
      for (const collection of collections) database.collections[collection.name] = true
    } catch (error) {
      database.error = error?.message === 'MONGODB_URI is not configured' ? 'MongoDB is not configured' : 'MongoDB is unavailable'
    }
  }

  const mailer = {
    configured: mailConfig.missing.length === 0,
    host: mailConfig.host || null,
    port: mailConfig.portValue || null,
    secure: ['true', '1', 'yes'].includes(String(process.env.SMTP_SECURE || '').trim().toLowerCase()),
    destEmail: process.env.RESET_DEST_EMAIL || null,
    verified: false,
    error: null
  }
  if (mailer.configured) {
    try {
      await getMailer().verify()
      mailer.verified = true
    } catch (error) {
      mailer.error = String(error?.message || error).slice(0, 300)
    }
  }

  const appUrl = { configured: env.APP_URL, valid: false, reason: null }
  if (env.APP_URL) {
    try {
      const u = new URL(process.env.APP_URL)
      appUrl.valid = u.protocol === 'https:' || u.protocol === 'http:'
      if (!appUrl.valid) appUrl.reason = 'protocol must be http(s)'
    } catch {
      appUrl.reason = 'not a valid URL'
    }
  }

  const nonMailMissing = Object.entries(env)
    .filter(([key]) => !['SMTP_FROM', 'MAIL_FROM', 'SMTP_PASS', 'SMTP_PASSWORD', 'SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_SECURE'].includes(key))
    .filter(([, value]) => !value)
    .map(([key]) => key)
  const missing = [...nonMailMissing, ...mailConfig.missing]
  const ready = Boolean(
    env.MONGODB_URI && database.reachable && database.collections.admin_users && database.collections.password_reset_tokens &&
    mailer.configured && mailer.verified && appUrl.valid
  )

  return res.status(200).json({ env, database, mailer, appUrl, missing, ready })
}
