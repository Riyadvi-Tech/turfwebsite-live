import crypto from 'node:crypto'

export const GENERIC_RESET_MESSAGE = 'If the email is registered, a password reset email has been sent.'
export const PASSWORD_MIN_LENGTH = 12

export function tokenPair() {
  const rawToken = crypto.randomBytes(32).toString('hex')
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex')
  return { rawToken, tokenHash }
}

export function hashToken(rawToken) {
  return crypto.createHash('sha256').update(rawToken).digest('hex')
}

export function validEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}
