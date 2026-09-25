import crypto from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { getDb } from '../_lib/mongodb.js'
import { parseAdminSessionToken } from '../_lib/cookies.js'

const moduleDirectory = path.dirname(fileURLToPath(import.meta.url))
const imagePath = path.resolve(moduleDirectory, '../../public/logo-assets/QR code.jpeg')

function fail(res, status, message) {
  return res.status(status).json({ success: false, message })
}

async function requireAdmin(req, db) {
  const rawToken = parseAdminSessionToken(req)
  if (!rawToken) return false

  const sessionTokenHash = crypto.createHash('sha256').update(rawToken).digest('hex')
  const session = await db.collection('admin_sessions').findOne({ sessionTokenHash })
  if (!session || (session.expiresAt && new Date(session.expiresAt) <= new Date())) return false

  const admin = await db.collection('admin_users').findOne(
    { _id: session.adminId, active: true },
    { projection: { _id: 1 } },
  )
  return Boolean(admin)
}

function normalizeMobile(value) {
  let mobile = String(value || '').replace(/\D/g, '')
  if (mobile.startsWith('00')) mobile = mobile.slice(2)
  if (mobile.length === 10) mobile = `91${mobile}`
  if (!/^\d{11,15}$/.test(mobile)) throw new Error('A valid customer WhatsApp number is required.')
  return mobile
}

function safeText(value, fallback = '—', maxLength = 200) {
  const text = String(value ?? '').trim()
  return (text || fallback).slice(0, maxLength)
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return fail(res, 405, 'Method not allowed')

  try {
    const db = await getDb()
    if (!await requireAdmin(req, db)) return fail(res, 401, 'Admin authentication required.')

    const mobile = normalizeMobile(req.body?.mobile)
    const name = safeText(req.body?.name, 'Customer', 120)
    const businessName = safeText(req.body?.businessName, 'TurfOn24', 120)
    const amount = Number(req.body?.amount || 0)
    const duration = Number(req.body?.duration || 0)
    const date = safeText(req.body?.date, 'your selected date', 80)
    const slotSummary = safeText(req.body?.slotSummary, 'your selected time', 500)
    const upiId = safeText(req.body?.upiId, '—', 120)
    const qrUrl = safeText(req.body?.qrUrl, '', 1000)
    const caption = [
      `*${businessName} Booking Notification*`,
      `Hello ${name},`,
      '',
      'Your turf slot has been booked successfully.',
      '',
      `Date: ${date}`,
      `Time: ${slotSummary}`,
      `Duration: ${duration || '—'} hour${duration === 1 ? '' : 's'}`,
      `Amount Due: ₹${amount.toLocaleString('en-IN')}`,
      '',
      `UPI ID: ${upiId}`,
      ...(qrUrl ? [`Pay Now: ${qrUrl}`] : []),
      '',
      'Please complete the payment and share the payment screenshot in this chat for verification.',
    ].join('\n')

    const { sendImage } = await import('../_lib/whatsapp-client.js')
    await sendImage(mobile, imagePath, caption)
    return res.status(200).json({ success: true, message: 'WhatsApp image notification sent.' })
  } catch (error) {
    console.error('[whatsapp-notify] failed:', error.message)
    const status = /valid customer|valid WhatsApp/.test(error.message) ? 400 : 503
    return fail(res, status, error.message || 'Unable to send the WhatsApp notification.')
  }
}
