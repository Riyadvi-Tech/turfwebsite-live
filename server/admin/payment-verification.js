import crypto from 'node:crypto'
import { getDb } from '../_lib/mongodb.js'
import { parseAdminSessionToken } from '../_lib/cookies.js'
import { materializeHourlyPayment } from '../_lib/booking-materialization.js'

const REFERENCE_PATTERN = /^T24-\d{8}-[A-F0-9]{8}(?:[A-F0-9]{24})?$/i

async function requireAdmin(req, db) {
  const raw = parseAdminSessionToken(req)
  if (!raw) return false
  const hash = crypto.createHash('sha256').update(raw).digest('hex')
  const session = await db.collection('admin_sessions').findOne({ sessionTokenHash: hash })
  if (!session || (session.expiresAt && new Date(session.expiresAt) <= new Date())) return false
  const admin = await db.collection('admin_users').findOne({ _id: session.adminId, active: true }, { projection: { _id: 1 } })
  return Boolean(admin)
}

function projection() {
  return { reference: 1, bookingType: 1, amount: 1, currency: 1, status: 1, bookingData: 1, paymentProof: 1, createdAt: 1, expiresAt: 1, paidAt: 1 }
}

export default async function handler(req, res) {
  if (!['GET', 'POST'].includes(req.method)) return res.status(405).json({ message: 'Method not allowed' })
  try {
    const db = await getDb()
    if (!await requireAdmin(req, db)) return res.status(401).json({ message: 'Admin authentication required.' })

    if (req.method === 'GET') {
      const status = String(req.query?.status || 'PENDING').trim().toUpperCase()
      const filter = status === 'ALL' ? { 'paymentProof.utrId': { $exists: true } } : { 'paymentProof.status': status }
      const verifications = await db.collection('payment_sessions').find(filter, { projection: projection() }).sort({ 'paymentProof.submittedAt': -1 }).limit(100).toArray()
      return res.status(200).json({ verifications })
    }

    const reference = String(req.body?.reference || '').trim()
    const decision = String(req.body?.decision || '').trim().toUpperCase()
    if (!REFERENCE_PATTERN.test(reference)) return res.status(400).json({ message: 'Invalid payment reference.' })
    if (!['APPROVE', 'REJECT'].includes(decision)) return res.status(400).json({ message: 'Invalid verification decision.' })

    const session = await db.collection('payment_sessions').findOne({ reference })
    if (!session?.paymentProof?.utrId) return res.status(404).json({ message: 'Payment proof not found.' })
    const now = new Date()
    if (decision === 'REJECT') {
      await db.collection('payment_sessions').updateOne({ reference }, { $set: { 'paymentProof.status': 'REJECTED', 'paymentProof.reviewedAt': now, updatedAt: now } })
      return res.status(200).json({ success: true, status: 'REJECTED' })
    }

    await db.collection('payment_sessions').updateOne(
      { reference, 'paymentProof.status': { $in: ['PENDING', 'REJECTED'] } },
      { $set: { status: 'PAID', paidAt: now, 'paymentProof.status': 'APPROVED', 'paymentProof.reviewedAt': now, updatedAt: now } },
    )
    const materialized = await materializeHourlyPayment(db, reference)
    return res.status(200).json({ success: true, status: 'APPROVED', bookingId: materialized.bookingId })
  } catch (error) {
    console.error('payment verification failed', error.message)
    return res.status(503).json({ message: error.message || 'Unable to verify payment proof.' })
  }
}
