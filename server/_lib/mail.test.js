import test from 'node:test'
import assert from 'node:assert/strict'
import { resetUrl } from './mail.js'

test('resetUrl falls back to request origin when APP_URL is missing', () => {
  const original = process.env.APP_URL
  delete process.env.APP_URL

  try {
    const url = resetUrl('abc123', {
      headers: {
        host: 'turfwebsite-live-cyan.vercel.app',
        'x-forwarded-proto': 'https',
      },
    })

    assert.equal(url, 'https://turfwebsite-live-cyan.vercel.app/admin/reset-password?token=abc123')
  } finally {
    if (original === undefined) {
      delete process.env.APP_URL
    } else {
      process.env.APP_URL = original
    }
  }
})
