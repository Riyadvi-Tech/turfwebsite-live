import crypto from 'node:crypto'
import { ObjectId } from 'mongodb'
import { getDb } from '../_lib/mongodb.js'

const BOOKING_STATUSES = new Set(['CONFIRMED', 'CANCELLED', 'COMPLETED', 'NO_SHOW'])
const PAYMENT_STATUSES = new Set(['PAID', 'PAYMENT_PENDING', 'EXPIRED', 'FAILED'])

function sessionToken(req) {
  return req.headers.cookie?.match(/(?:^|; )turfon24_admin_session=([^;]+)/)?.[1]
}

async function requireAdmin(req, db) {
  const raw = sessionToken(req)
  if (!raw) return false

  const sessionTokenHash = crypto.createHash('sha256').update(raw).digest('hex')
  const session = await db.collection('admin_sessions').findOne({ sessionTokenHash })
  if (!session || (session.expiresAt && new Date(session.expiresAt) <= new Date())) return false

  const admin = await db.collection('admin_users').findOne({
    _id: session.adminId,
    active: true,
  }, { projection: { _id: 1 } })
  return Boolean(admin)
}

function safeId(req) {
  const queryId = Array.isArray(req.query?.id) ? req.query.id[0] : req.query?.id
  if (queryId) return String(queryId).trim()
  const path = String(req.url || '').split('?')[0].replace(/\/$/, '')
  const match = /\/api\/admin\/bookings\/([^/]+)$/.exec(path)
  return match ? decodeURIComponent(match[1]) : ''
}

function parseObjectId(value) {
  return ObjectId.isValid(value) ? new ObjectId(value) : null
}

function parseStatus(value, allowed, field) {
  if (value === undefined || value === null || value === '') return null
  const status = String(value).trim().toUpperCase().replaceAll('-', '_')
  if (!allowed.has(status)) throw new Error(`Invalid ${field}.`)
  return status
}

function parseDate(value) {
  if (value === undefined || value === '') return null
  const date = String(value).trim()
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
  if (!match) throw new Error('Invalid date.')
  const parsed = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])))
  if (
    parsed.getUTCFullYear() !== Number(match[1]) ||
    parsed.getUTCMonth() !== Number(match[2]) - 1 ||
    parsed.getUTCDate() !== Number(match[3])
  ) throw new Error('Invalid date.')
  return date
}

function parsePagination(query) {
  const page = Number(query.page || 1)
  const limit = Number(query.limit || 25)
  if (!Number.isInteger(page) || page < 1 || !Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new Error('Invalid pagination.')
  }
  return { page, limit }
}

function bookingProjection() {
  return {
    mobile: 1,
    date: 1,
    time: 1,
    duration: 1,
    amount: 1,
    paymentReference: 1,
    paymentStatus: 1,
    bookingStatus: 1,
    slots: 1,
    createdAt: 1,
    updatedAt: 1,
  }
}

function publicBooking(booking) {
  return {
    ...booking,
    _id: String(booking._id),
  }
}

function errorResponse(res, status, message) {
  return res.status(status).json({ message })
}

export default async function handler(req, res) {
  if (!['GET', 'PATCH'].includes(req.method)) return errorResponse(res, 405, 'Method not allowed')

  try {
    const db = await getDb()
    if (!await requireAdmin(req, db)) return errorResponse(res, 401, 'Admin authentication required.')

    const idValue = safeId(req)
    if (idValue) {
      const id = parseObjectId(idValue)
      if (!id) return errorResponse(res, 400, 'Invalid booking id.')

      if (req.method === 'GET') {
        const booking = await db.collection('bookings').findOne(
          { _id: id },
          { projection: bookingProjection() },
        )
        if (!booking) return errorResponse(res, 404, 'Booking not found.')

        const [payment, customer] = await Promise.all([
          db.collection('payments').findOne(
            { paymentReference: booking.paymentReference },
            { projection: { _id: 0, bookingId: 1, paymentReference: 1, amount: 1, currency: 1, status: 1, method: 1, verifiedAt: 1, createdAt: 1, updatedAt: 1 } },
          ),
          db.collection('customers').findOne(
            { mobile: booking.mobile },
            { projection: { _id: 0, mobile: 1, totalBookings: 1, totalSpent: 1, createdAt: 1, updatedAt: 1 } },
          ),
        ])

        return res.status(200).json({ booking: publicBooking(booking), payment: payment || null, customer: customer || null })
      }

      const requestedStatus = parseStatus(req.body?.bookingStatus ?? req.body?.status, BOOKING_STATUSES, 'booking status')
      if (!requestedStatus) return errorResponse(res, 400, 'Booking status is required.')

      const now = new Date()
      const result = await db.collection('bookings').findOneAndUpdate(
        { _id: id },
        { $set: { bookingStatus: requestedStatus, updatedAt: now } },
        { returnDocument: 'after', projection: bookingProjection() },
      )
      if (!result) return errorResponse(res, 404, 'Booking not found.')
      return res.status(200).json({ booking: publicBooking(result) })
    }

    if (req.method !== 'GET') return errorResponse(res, 400, 'Booking id is required.')

    const { page, limit } = parsePagination(req.query || {})
    const date = parseDate(req.query?.date)
    const startDate = parseDate(req.query?.startDate)
    const endDate = parseDate(req.query?.endDate)
    if ((startDate && !endDate) || (!startDate && endDate)) throw new Error('Both start and end dates are required.')
    if (startDate && endDate && endDate < startDate) throw new Error('Invalid date range.')
    if (startDate && endDate && (new Date(`${endDate}T00:00:00Z`) - new Date(`${startDate}T00:00:00Z`)) > 62 * 86400000) {
      throw new Error('Date range is too large.')
    }
    const bookingStatus = parseStatus(req.query?.bookingStatus, BOOKING_STATUSES, 'booking status')
    const paymentStatus = parseStatus(req.query?.paymentStatus, PAYMENT_STATUSES, 'payment status')
    const mobile = req.query?.mobile === undefined ? '' : String(req.query.mobile).trim()
    if (mobile && !/^\d{3,15}$/.test(mobile)) throw new Error('Invalid mobile.')

    const filter = {}
    if (date) filter.date = date
    if (startDate && endDate) filter.date = { $gte: startDate, $lte: endDate }
    if (bookingStatus) filter.bookingStatus = bookingStatus
    if (paymentStatus) filter.paymentStatus = paymentStatus
    if (mobile) filter.mobile = mobile

    const collection = db.collection('bookings')
    const [total, bookings] = await Promise.all([
      collection.countDocuments(filter),
      collection.find(filter, { projection: bookingProjection() })
        .sort({ createdAt: -1, _id: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .toArray(),
    ])

    return res.status(200).json({
      bookings: bookings.map(publicBooking),
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    })
  } catch (error) {
    if (/^Invalid /.test(error.message)) return errorResponse(res, 400, error.message)
    console.error('admin bookings failed', error.message)
    return errorResponse(res, 503, 'Booking records are temporarily unavailable.')
  }
}
