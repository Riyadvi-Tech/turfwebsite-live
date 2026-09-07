import crypto from 'node:crypto'

const MSG91_VERIFY_URL = 'https://control.msg91.com/api/v5/widget/verifyAccessToken'
const OTP_AUTH_TTL_MS = 15 * 60 * 1000

export class OtpAuthorizationError extends Error {
  constructor(message) {
    super(message)
    this.code = 'OTP_NOT_VERIFIED'
  }
}

function normalizeMobile(value) {
  return String(value || '').replace(/\D/g, '')
}

function tokenPayload(token) {
  const parts = String(token).split('.')
  if (parts.length !== 3) return null
  try {
    return JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'))
  } catch {
    return null
  }
}

function mobileClaims(value) {
  if (!value || typeof value !== 'object') return []
  const claims = []
  for (const key of ['mobile', 'mobileNumber', 'phone', 'phoneNumber', 'msisdn']) {
    const candidate = normalizeMobile(value[key])
    if (/^\d{10,15}$/.test(candidate)) claims.push(candidate)
  }
  for (const key of ['data', 'user', 'payload']) claims.push(...mobileClaims(value[key]))
  return claims
}

function verifiedMobile(response, token) {
  const claims = [
    ...mobileClaims(response),
    ...mobileClaims(tokenPayload(token)),
  ]
  return [...new Set(claims)]
}

export async function verifyOtpAccessToken(accessToken, mobile) {
  const token = String(accessToken || '').trim()
  const expectedMobile = normalizeMobile(mobile)
  const authKey = String(process.env.MSG91_AUTH_KEY || '').trim()
  if (!token || token.length > 4096 || !/^\d{10,15}$/.test(expectedMobile) || !authKey) {
    throw new OtpAuthorizationError('Mobile OTP verification is required.')
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 5000)
  let response
  try {
    response = await fetch(MSG91_VERIFY_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        authkey: authKey,
      },
      body: JSON.stringify({ 'access-token': token }),
      signal: controller.signal,
    })
  } catch {
    throw new OtpAuthorizationError('Mobile OTP verification is temporarily unavailable.')
  } finally {
    clearTimeout(timeout)
  }

  let payload = null
  try {
    payload = await response.json()
  } catch {
    payload = null
  }

  if (!response.ok || payload?.type !== 'success') {
    throw new OtpAuthorizationError('Mobile OTP verification failed.')
  }

  const mobiles = verifiedMobile(payload, token)
  if (!mobiles.includes(expectedMobile)) {
    throw new OtpAuthorizationError('Mobile OTP verification does not match this number.')
  }

  const now = new Date()
  return {
    mobile: expectedMobile,
    tokenHash: crypto.createHash('sha256').update(token).digest('hex'),
    verifiedAt: now,
    expiresAt: new Date(now.getTime() + OTP_AUTH_TTL_MS),
  }
}

export function assertOtpAuthorization(authorization, mobile, now = new Date()) {
  const expectedMobile = normalizeMobile(mobile)
  if (
    !authorization ||
    authorization.mobile !== expectedMobile ||
    !authorization.expiresAt ||
    new Date(authorization.expiresAt) <= now
  ) {
    throw new OtpAuthorizationError('Mobile OTP verification is missing or expired.')
  }
}