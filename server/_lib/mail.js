import nodemailer from 'nodemailer'

function firstConfigured(...names) {
  return names.map((name) => String(process.env[name] || '').trim()).find(Boolean) || ''
}

export function getMailConfig() {
  const host = firstConfigured('SMTP_HOST')
  const portValue = firstConfigured('SMTP_PORT')
  const user = firstConfigured('SMTP_USER')
  const password = firstConfigured('SMTP_PASS', 'SMTP_PASSWORD')
  const from = firstConfigured('SMTP_FROM', 'MAIL_FROM')
  const missing = []
  if (!host) missing.push('SMTP_HOST')
  if (!portValue) missing.push('SMTP_PORT')
  if (!user) missing.push('SMTP_USER')
  if (!password) missing.push('SMTP_PASS')
  if (!from) missing.push('SMTP_FROM')
  return { host, portValue, user, password, from, missing }
}

export function getMailer() {
  const config = getMailConfig()
  if (config.missing.length) throw new Error(`SMTP configuration is incomplete: ${config.missing.join(', ')}`)
  const port = Number(config.portValue)
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('SMTP_PORT is invalid')
  }
  const secureValue = String(process.env.SMTP_SECURE || '').trim().toLowerCase()
  const secure = secureValue ? ['true', '1', 'yes'].includes(secureValue) : port === 465
  console.info('[SMTP] configuration loaded', JSON.stringify({ host: config.host, port, secure, userConfigured: Boolean(config.user), passwordConfigured: Boolean(config.password) }))
  return nodemailer.createTransport({
    host: config.host,
    port,
    secure,
    auth: { user: config.user, pass: config.password },
    connectionTimeout: 6000,
    greetingTimeout: 6000,
    socketTimeout: 8000,
  })
}

function getRequestOrigin(req) {
  if (!req) return null

  const forwardedProto = req.headers?.['x-forwarded-proto']
  const forwardedHost = req.headers?.['x-forwarded-host'] || req.headers?.host
  const proto = Array.isArray(forwardedProto) ? forwardedProto[0] : (forwardedProto || 'https')
  const host = Array.isArray(forwardedHost) ? forwardedHost[0] : (forwardedHost || 'localhost')

  if (!host) return null
  return `${proto.replace(/\/$/, '')}://${host.replace(/^\/+|\/+$/g, '')}`
}

export function resetUrl(token, req = null) {
  const baseUrl = process.env.APP_URL || getRequestOrigin(req)
  if (!baseUrl) throw new Error('APP_URL is not configured and no request origin is available')
  if (process.env.VERCEL === '1' && /localhost|127\.0\.0\.1/i.test(baseUrl)) {
    throw new Error('APP_URL must use the production website URL on Vercel')
  }

  // Use the canonical reset route that matches the deployed admin page route.
  // This ensures the link opens the admin reset form on both localhost and the
  // production site without redirecting into the wrong page shell.
  return `${baseUrl.replace(/\/$/, '')}/admin/reset-password?token=${encodeURIComponent(token)}`
}

export function classifyMailError(error) {
  const msg = String(error?.message || error || '')
  if (/configuration is incomplete|is not configured|SMTP_PORT is invalid/.test(msg)) return 'MAIL_CONFIG_MISSING'
  if (/ECONNREFUSED|ENOTFOUND|EAI_AGAIN|ETIMEDOUT|ESOCKET|ECONNECTION|getaddrinfo|connection (closed|terminated)|timeout/i.test(msg)) return 'MAIL_UNREACHABLE'
  if (/535|Invalid login|authentication failed|Credentials|EAUTH/i.test(msg)) return 'MAIL_AUTH_ERROR'
  if (/ENVELOPE|Invalid recipient|No recipients|5\d\d/i.test(msg)) return 'MAIL_INVALID_RECIPIENT'
  if (/TLS|SSL|certificate/i.test(msg)) return 'MAIL_SSL_ERROR'
  return 'MAIL_OTHER'
}
