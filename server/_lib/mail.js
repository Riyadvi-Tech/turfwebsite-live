import nodemailer from 'nodemailer'

export function getMailer() {
  const required = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASSWORD', 'MAIL_FROM']
  const missing = required.filter((name) => !process.env[name])
  if (missing.length) throw new Error(`SMTP configuration is incomplete: ${missing.join(', ')}`)
  if (!Number.isInteger(Number(process.env.SMTP_PORT)) || Number(process.env.SMTP_PORT) < 1 || Number(process.env.SMTP_PORT) > 65535) {
    throw new Error('SMTP_PORT is invalid')
  }
  return nodemailer.createTransport({ host: process.env.SMTP_HOST, port: Number(process.env.SMTP_PORT), secure: process.env.SMTP_SECURE === 'true', auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD } })
}

export function resetUrl(token) {
  const baseUrl = process.env.APP_URL
  if (!baseUrl) throw new Error('APP_URL is not configured')
  return `${baseUrl.replace(/\/$/, '')}/admin/reset-password?token=${encodeURIComponent(token)}`
}

export function classifyMailError(error) {
  const msg = String(error?.message || error || '')
  if (/configuration is incomplete|is not configured|SMTP_PORT is invalid/.test(msg)) return 'MAIL_CONFIG_MISSING'
  if (/ECONNREFUSED|ENOTFOUND|EAI_AGAIN|ETIMEDOUT|getaddrinfo|connection (closed|terminated)|timeout/i.test(msg)) return 'MAIL_UNREACHABLE'
  if (/535|Invalid login|authentication failed|Credentials|EAUTH/i.test(msg)) return 'MAIL_AUTH_ERROR'
  if (/ENVELOPE|Invalid recipient|No recipients|5\d\d/i.test(msg)) return 'MAIL_INVALID_RECIPIENT'
  if (/TLS|SSL|certificate/i.test(msg)) return 'MAIL_SSL_ERROR'
  return 'MAIL_OTHER'
}
