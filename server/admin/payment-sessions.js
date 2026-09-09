import crypto from 'node:crypto'
import { getDb } from '../_lib/mongodb.js'
import { parseAdminSessionToken } from '../_lib/cookies.js'
import { MaterializationError, materializeHourlyPayment } from '../_lib/booking-materialization.js'

function sessionToken(req) {
  return parseAdminSessionToken(req)
}

async function requireAdmin(req, db) {
  const raw = sessionToken(req)
  if (!raw) return false

  const hash = crypto.createHash('sha256').update(raw).digest('hex')
  const session = await db.collection('admin_sessions').findOne({
    sessionTokenHash: hash,
  })

  if (!session || (session.expiresAt && new Date(session.expiresAt) <= new Date())) return false

  const admin = await db.collection('admin_users').findOne({
    _id: session.adminId,
    active: true,
  })

  return Boolean(admin)
}

function normalizeStatus(value) {
  return String(value || '').trim().toUpperCase()
}

function cancelledByBooking(booking) {
  if (!booking || typeof booking !== 'object') return false
  return normalizeStatus(booking.bookingStatus) === 'CANCELLED' || normalizeStatus(booking.paymentStatus) === 'CANCELLED'
}

function safeBookingData(data) {
  if (!data || typeof data !== 'object') return {}
  const allowed = ['type', 'mobile', 'date', 'dateLabel', 'startTime', 'endTime', 'time', 'duration', 'hours', 'days', 'startDate', 'endDate', 'preferredTimes', 'preferredTime', 'name', 'customerName']
  const result = {}
  for (const key of allowed) {
    if (data[key] !== undefined && data[key] !== null) result[key] = data[key]
  }
  if (Array.isArray(data.slots)) {
    result.slots = data.slots.map((slot) => ({
      start: slot?.start,
      end: slot?.end,
      hours: slot?.hours,
    }))
  }
  return result
}

async function expireSessions(db) {
  await db.collection('payment_sessions').updateMany(
    {
      status: 'PAYMENT_PENDING',
      expiresAt: { $lte: new Date() },
    },
    {
      $set: {
        status: 'EXPIRED',
        updatedAt: new Date(),
      },
    },
  )
}

export default async function handler(req, res) {
  if (!['GET', 'POST'].includes(req.method)) {
    return res.status(405).json({ message: 'Method not allowed' })
  }

  try {
    const db = await getDb()
    if (!await requireAdmin(req, db)) {
      return res.status(401).json({
        message: 'Admin authentication required.',
      })
    }

    await expireSessions(db)

    if (req.method === 'GET') {
      const status = String(req.query?.status || 'all')
        .trim()
        .toUpperCase()

      const search = String(req.query?.search || '').trim()

      const allowedStatuses = new Set([
        'PAYMENT_PENDING',
        'PAID',
        'EXPIRED',
        'FAILED',
        'CANCELLED',
      ])

      const filter = {}

      if (allowedStatuses.has(status) && status !== 'CANCELLED') {
        filter.status = status
      }

      if (search) {
        const safeSearch = search.slice(0, 100).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        filter.$or = [
          {
            reference: {
              $regex: safeSearch,
              $options: 'i',
            },
          },
          {
            'bookingData.mobile': {
              $regex: safeSearch,
              $options: 'i',
            },
          },
          {
            'bookingData.phone': {
              $regex: safeSearch,
              $options: 'i',
            },
          },
        ]
      }

      const sessions = await db
        .collection('payment_sessions')
        .find(filter, { projection: { reference: 1, bookingType: 1, amount: 1, currency: 1, status: 1, bookingData: 1, createdAt: 1, expiresAt: 1, paidAt: 1 } })
        .sort({ createdAt: -1 })
        .toArray()

      const bookingFilter = {}
      if (allowedStatuses.has(status)) {
        if (status === 'CANCELLED') {
          bookingFilter.bookingStatus = 'CANCELLED'
        } else {
          bookingFilter.paymentStatus = status
        }
      }
      if (search) {
        const safeSearch = search.slice(0, 100).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        bookingFilter.$or = [
          { paymentReference: { $regex: safeSearch, $options: 'i' } },
          { mobile: { $regex: safeSearch, $options: 'i' } },
          { name: { $regex: safeSearch, $options: 'i' } },
        ]
      }
      const bookings = await db.collection('bookings')
        .find(bookingFilter, { projection: { _id: 1, name: 1, customerName: 1, mobile: 1, date: 1, time: 1, duration: 1, amount: 1, paymentReference: 1, paymentStatus: 1, bookingStatus: 1, slots: 1, createdAt: 1, updatedAt: 1 } })
        .sort({ createdAt: -1, _id: -1 })
        .limit(100)
        .toArray()

      const sessionReferences = new Set(sessions.map((session) => session.reference))
      const bookingByReference = new Map(bookings.filter((booking) => booking.paymentReference).map((booking) => [booking.paymentReference, booking]))

      const filteredSessions = sessions.filter((session) => {
        const booking = bookingByReference.get(session.reference)
        return !booking || booking.bookingStatus !== 'CANCELLED' || booking.paymentStatus !== 'CANCELLED'
          ? true
          : true
      })

      const bookingSessions = bookings
        .filter((booking) => !booking.paymentReference || !sessionReferences.has(booking.paymentReference))
        .map((booking) => {
          const statusFromBooking = cancelledByBooking(booking)
            ? 'CANCELLED'
            : normalizeStatus(booking.paymentStatus) || (normalizeStatus(booking.bookingStatus) === 'CONFIRMED' ? 'PAID' : 'PAYMENT_PENDING')
          return {
            reference: booking.paymentReference || String(booking._id),
            bookingId: String(booking._id),
            source: 'booking',
            bookingType: 'hourly',
            amount: Number(booking.amount || 0),
            currency: 'INR',
            status: statusFromBooking,
            bookingData: safeBookingData({
              type: 'hourly',
              name: booking.name || booking.customerName,
              mobile: booking.mobile,
              date: booking.date,
              time: booking.time,
              duration: booking.duration,
              slots: booking.slots,
            }),
            createdAt: booking.createdAt,
            expiresAt: null,
            paidAt: normalizeStatus(booking.paymentStatus) === 'PAID' ? booking.updatedAt : null,
          }
        })

      const mergedSessions = [...filteredSessions.map((session) => {
        const booking = bookingByReference.get(session.reference)
        const normalizedStatus = cancelledByBooking(booking)
          ? 'CANCELLED'
          : session.status
        return {
          reference: session.reference,
          bookingId: booking?._id ? String(booking._id) : session.reference,
          source: 'payment_session',
          bookingType: session.bookingType,
          amount: session.amount,
          currency: session.currency,
          status: normalizedStatus,
          bookingData: safeBookingData(session.bookingData),
          createdAt: session.createdAt,
          expiresAt: session.expiresAt,
          paidAt: session.paidAt || null,
        }
      }), ...bookingSessions]

      const normalizedMergedSessions = mergedSessions.map((row) => ({
        ...row,
        status: normalizeStatus(row.status) === 'CANCELLED' ? 'CANCELLED' : row.status,
      }))

      const finalSessions = normalizedMergedSessions.filter((row) => {
        if (status === 'CANCELLED') return row.status === 'CANCELLED'
        if (status === 'PAID') return row.status === 'PAID'
        if (status === 'PAYMENT_PENDING') return row.status === 'PAYMENT_PENDING'
        if (status === 'EXPIRED') return row.status === 'EXPIRED'
        if (status === 'FAILED') return row.status === 'FAILED'
        return true
      })

      return res.status(200).json({
        sessions: finalSessions,
      })
    }

    const reference = String(req.body?.reference || '').trim()

    if (!/^T24-\d{8}-[A-F0-9]{8}(?:[A-F0-9]{24})?$/i.test(reference)) {
      return res.status(400).json({
        message: 'Payment reference is required.',
      })
    }

    const paymentSession = await db.collection('payment_sessions').findOne({ reference })
    if (!paymentSession) return res.status(404).json({ message: 'Payment session not found.' })

    if (paymentSession.bookingType === 'hourly') {
      const materialized = await materializeHourlyPayment(db, reference, { transitionToPaid: true })
      return res.status(materialized.created ? 201 : 200).json({
        reference,
        amount: materialized.amount,
        currency: paymentSession.currency,
        status: 'PAID',
        paidAt: new Date(),
        bookingId: materialized.bookingId,
        materialized: true,
      })
    }

    if (paymentSession.bookingType !== 'extended') {
      return res.status(409).json({ message: 'Unsupported payment type.' })
    }
    if (paymentSession.status === 'PAID') {
      return res.status(200).json({
        reference,
        amount: paymentSession.amount,
        currency: paymentSession.currency,
        status: 'PAID',
        paidAt: paymentSession.paidAt || null,
        materialized: false,
      })
    }

    const now = new Date()
    const result = await db.collection('payment_sessions').findOneAndUpdate(
      { reference, status: 'PAYMENT_PENDING', expiresAt: { $gt: now } },
      { $set: { status: 'PAID', paidAt: now, updatedAt: now } },
      { returnDocument: 'after' },
    )
    if (!result) return res.status(409).json({ message: `Payment session is ${paymentSession.status}.` })

    return res.status(200).json({
      reference: result.reference,
      amount: result.amount,
      currency: result.currency,
      status: result.status,
      paidAt: result.paidAt,
      materialized: false,
    })
  } catch (error) {
    if (error instanceof MaterializationError) {
      const status = error.code === 'NOT_FOUND' ? 404 : error.code === 'INVALID_BOOKING' ? 400 : 409
      return res.status(status).json({ message: error.message, status: error.code === 'SLOT_UNAVAILABLE' ? 'PAYMENT_PENDING' : undefined })
    }
    console.error(
      'admin payment sessions failed',
      error.message,
    )

    return res.status(503).json({
      message: 'Payment records are temporarily unavailable.',
    })
  }
}