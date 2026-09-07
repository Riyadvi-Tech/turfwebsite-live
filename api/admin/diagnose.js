import { getDb } from '../_lib/mongodb.js'
import { getMailer } from '../_lib/mail.js'

function presence(...names) {
  const out = {}
  for (const name of names) out[name] = Boolean(process.env[name])
  return out
}

export default async function handler(_req, res) {
  const env = presence('MONGODB_URI', 'MONGODB_DB', 'APP_URL', 'MAIL_FROM', 'SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASSWORD', 'SMTP_SECURE', 'RESET_DEST_EMAIL')

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
    configured: Boolean(env.SMTP_HOST && env.SMTP_PORT && env.SMTP_USER && env.SMTP_PASSWORD && env.MAIL_FROM),
    port: process.env.SMTP_PORT || null,
    secure: process.env.SMTP_SECURE === 'true',
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

  const missing = Object.entries(env).filter(([, v]) => !v).map(([k]) => k)
  const ready = Boolean(
    env.MONGODB_URI && database.reachable && database.collections.admin_users && database.collections.password_reset_tokens &&
    mailer.configured && mailer.verified && appUrl.valid
  )

  return res.status(200).json({ env, database, mailer, appUrl, missing, ready })
}
