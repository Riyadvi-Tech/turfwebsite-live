import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { getDb } from './_lib/mongodb.js'

const moduleDirectory = path.dirname(fileURLToPath(import.meta.url))
const qrPaths = [
  'QRCode1.jpg',
  'QRCode1.png',
  'QRCode1.jpeg',
  'qrcodepng.png',
  'QR code.jpeg',
].map((filename) => path.resolve(moduleDirectory, '../public/logo-assets', filename))
const mimeTypes = new Map([
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
])

function fail(res, status, message) {
  return res.status(status).json({ success: false, message })
}

function safeText(value, maxLength = 160) {
  return String(value ?? '').trim().replace(/[\r\n]/g, ' ').slice(0, maxLength) || '—'
}

function resolveQrImage(filePath) {
  const resolvedPath = path.resolve(filePath)
  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`Payment QR image was not found: ${resolvedPath}`)
  }

  const extension = path.extname(resolvedPath).toLowerCase()
  const mimeType = mimeTypes.get(extension)
  if (!mimeType) {
    throw new Error(`Unsupported payment QR image type at ${resolvedPath}. Use PNG, JPG, or JPEG.`)
  }

  return resolvedPath
}

function bookingCaption(session) {
  const booking = session.bookingData || {}
  const amount = Number(session.amount)
  const amountLabel = Number.isFinite(amount) ? amount.toLocaleString('en-IN') : '—'
  return [
    '⚽ *TURF BOOKING RESERVATION* ⚽',
    '',
    `Customer: ${safeText(booking.name)}`,
    `Date: ${safeText(booking.date)}`,
    `Time slot: ${safeText(booking.time)}`,
    `Amount: ₹${amountLabel}`,
    `Booking ID: ${safeText(session.reference)}`,
    '',
    'Payment steps:',
    '1. Scan the attached GPay QR with Google Pay, PhonePe, or Paytm.',
    '2. Enter the exact booking amount shown above.',
    `3. Add ${safeText(session.reference)} in the UPI payment note/remark.`,
    '4. Reply with the 12-digit UTR/Ref number or payment screenshot to confirm.',
    '',
    'Your slot is held for 15 minutes. This booking is confirmed after payment verification.',
  ].join('\n')
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return fail(res, 405, 'Method not allowed')

  const reference = String(req.body?.reference || '').trim()
  if (!/^T24-\d{8}-[A-F0-9]{32}$/i.test(reference)) {
    return fail(res, 400, 'A valid payment reference is required.')
  }

  try {
    const db = await getDb()
    const session = await db.collection('payment_sessions').findOne({ reference })
    if (!session || session.bookingType !== 'hourly') {
      return fail(res, 404, 'Payment session not found.')
    }
    if (session.status !== 'PAYMENT_PENDING' || new Date(session.expiresAt) <= new Date()) {
      return fail(res, 409, 'This payment session is no longer active.')
    }
    if (session.qrSentAt) {
      return res.status(200).json({ success: true, message: 'QR already sent successfully.' })
    }

    const mobile = String(session.bookingData?.mobile || '').replace(/\D/g, '')
    if (!/^\d{10,15}$/.test(mobile)) return fail(res, 400, 'A valid customer WhatsApp number is required.')

    const imagePath = qrPaths.find((candidate) => fs.existsSync(candidate)) || qrPaths[0]
    const { sendImage } = await import('./_lib/whatsapp-client.js')
    await sendImage(mobile, resolveQrImage(imagePath), bookingCaption(session))
    await db.collection('payment_sessions').updateOne(
      { _id: session._id, status: 'PAYMENT_PENDING', qrSentAt: { $exists: false } },
      { $set: { qrSentAt: new Date(), updatedAt: new Date() } },
    )
    return res.status(200).json({ success: true, message: 'QR sent successfully.' })
  } catch (error) {
    console.error('[send-payment-qr] failed:', error.message)
    return fail(res, 503, error.message || 'Unable to send the payment QR.')
  }
}