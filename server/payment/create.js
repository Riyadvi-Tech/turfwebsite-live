import crypto from 'node:crypto'
import Razorpay from 'razorpay'
import { getDb } from '../_lib/mongodb.js'

export const HOURLY_RATE = 800
const PAYMENT_TTL_MINUTES = 15
const MAX_HOURLY_DURATION = 60
const MAX_SLOTS = 5
const TIME_PATTERN = /^(\d{1,2}):(\d{2})\s?(AM|PM)(?:\s*\(next day\))?$/i

async function getConfiguredHourlyRate(db) {
  const fallback = Number(process.env.HOURLY_RATE ?? HOURLY_RATE) || HOURLY_RATE
  if (!db) return fallback

  try {
    const settings = await db.collection('website_settings').findOne({ key: 'main' }, { projection: { _id: 0, hourlyRate: 1 } })
    const value = Number(settings?.hourlyRate)
    return Number.isFinite(value) && value > 0 ? value : fallback
  } catch (error) {
    return fallback
  }
}

async function getConfiguredPaymentDetails(db) {
  const fallbackUpiId = process.env.PAYMENT_UPI_ID || 'Vyapar.176885106737@hdfcbank'
  const fallbackMerchantName = process.env.PAYMENT_UPI_NAME || 'Turf'
  if (!db) return { upiId: fallbackUpiId, merchantName: fallbackMerchantName }

  try {
    const settings = await db.collection('website_settings').findOne({ key: 'main' }, { projection: { _id: 0, upiId: 1, upi: 1, businessName: 1 } })
    const upiId = String(settings?.upiId || settings?.upi || '').trim() || fallbackUpiId
    const merchantName = String(settings?.businessName || '').trim() || fallbackMerchantName
    return { upiId, merchantName }
  } catch (error) {
    return { upiId: fallbackUpiId, merchantName: fallbackMerchantName }
  }
}

async function isBookingBlocked(db) {
  if (!db) return false

  try {
    const settings = await db.collection('website_settings').findOne({ key: 'main' }, { projection: { _id: 0, bookingsBlocked: 1 } })
    return settings?.bookingsBlocked === true || settings?.bookingsBlocked === 'true' || settings?.bookingsBlocked === 1 || settings?.bookingsBlocked === '1'
  } catch (error) {
    return false
  }
}

function getRazorpayClient() {
  const keyId = process.env.RAZORPAY_KEY_ID
  const keySecret = process.env.RAZORPAY_KEY_SECRET

  if (!keyId || !keySecret) return null

  try {
    return new Razorpay({
      key_id: keyId,
      key_secret: keySecret,
    })
  } catch (error) {
    console.error('[payment] Razorpay client initialization failed', error)
    return null
  }
}

async function maybeCreateRazorpayOrder(session) {
  const client = getRazorpayClient()
  if (!client) return null

  try {
    const amountInPaise = Math.round(Number(session.amount || 0) * 100)
    const order = await client.orders.create({
      amount: amountInPaise,
      currency: 'INR',
      receipt: String(session.reference),
      notes: {
        reference: session.reference,
        bookingType: session.bookingType,
      },
    })

    if (order && order.id) {
      return {
        paymentMode: 'RAZORPAY',
        razorpayKey: process.env.RAZORPAY_KEY_ID,
        razorpayOrderId: order.id,
        razorpayAmount: amountInPaise,
        razorpayCurrency: 'INR',
      }
    }
  } catch (error) {
    console.error('[payment] Razorpay order creation failed', error)
  }

  return null
}

function money(value) {
  return Math.round(value * 100) / 100
}

function invalidBooking(message) {
  const error = new Error(message)
  error.code = 'INVALID_BOOKING'
  return error
}

function parseDate(value) {
  const date = String(value || '')
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
  if (!match) throw invalidBooking('Invalid booking date.')

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const parsed = new Date(Date.UTC(year, month - 1, day))
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) throw invalidBooking('Invalid booking date.')

  const now = new Date()
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  if (parsed.getTime() < today) throw invalidBooking('Booking date is in the past.')
  return date
}

function parseTime(value) {
  const normalized = String(value || '').trim().replace(/\s+/g, ' ')
  const match = TIME_PATTERN.exec(normalized)
  if (!match) throw invalidBooking('Invalid booking time.')

  const hour = Number(match[1])
  const minute = Number(match[2])
  if (hour < 1 || hour > 12 || minute !== 0) throw invalidBooking('Invalid booking time.')
  const isPm = match[3].toUpperCase() === 'PM'
  const baseHour = (hour % 12) + (isPm ? 12 : 0)
  const nextDay = /\(next day\)$/i.test(normalized)
  const minutes = baseHour * 60 + minute + (nextDay ? 1440 : 0)
  if (baseHour > 23 || minutes < 0 || minutes >= 2880) throw invalidBooking('Invalid booking time.')
  return minutes
}

function formatTime(minutes) {
  const dayOffset = minutes >= 1440 ? ' (+1d)' : ''
  const withinDay = minutes % 1440
  const hour24 = Math.floor(withinDay / 60)
  const hour = hour24 % 12 || 12
  const suffix = hour24 >= 12 ? 'PM' : 'AM'
  return `${String(hour).padStart(2, '0')}:${String(withinDay % 60).padStart(2, '0')} ${suffix}${dayOffset}`
}

function normalizeMobile(value) {
  const mobile = String(value || '').replace(/\D/g, '')
  if (!/^\d{10,15}$/.test(mobile)) throw invalidBooking('A valid mobile number is required.')
  return mobile
}

function normalizeName(value) {
  const name = String(value || '').trim().replace(/\s+/g, ' ')
  if (!name || name.length > 120) throw invalidBooking('A valid name is required.')
  return name
}

export function normalizeHourlyBookingData(input, hourlyRate = HOURLY_RATE) {
  if (!input || input.type !== 'hourly') throw invalidBooking('Only hourly bookings are supported.')

  const date = parseDate(input.date)
  if (typeof input.duration !== 'number' || !Number.isInteger(input.duration)) {
    throw invalidBooking('Invalid booking duration.')
  }

  const rate = Number(hourlyRate) || HOURLY_RATE

  const rawSlots = Array.isArray(input.slots) && input.slots.length
    ? input.slots
    : [{ start: input.startTime, end: input.endTime, hours: input.duration }]
  if (rawSlots.length < 1 || rawSlots.length > MAX_SLOTS) throw invalidBooking('Invalid booking slots.')

  const slots = rawSlots.map((slot) => {
    if (!slot || typeof slot.hours !== 'number' || !Number.isInteger(slot.hours) || slot.hours < 1 || slot.hours > 12) {
      throw invalidBooking('Invalid booking duration.')
    }
    const startMinutes = parseTime(slot.start)
    const endMinutes = parseTime(slot.end)
    if (startMinutes >= 1440 || endMinutes <= startMinutes || endMinutes - startMinutes !== slot.hours * 60) {
      throw invalidBooking('Booking time does not match the duration.')
    }

    const slotKeys = []
    for (let minute = startMinutes; minute < endMinutes; minute += 60) {
      slotKeys.push(`${date}T${formatTime(minute)}`)
    }
    return {
      start: formatTime(startMinutes),
      end: formatTime(endMinutes),
      hours: slot.hours,
      slotKeys,
      startMinutes,
      endMinutes,
    }
  })

  const sorted = [...slots].sort((left, right) => left.startMinutes - right.startMinutes)
  for (let index = 1; index < sorted.length; index += 1) {
    if (sorted[index - 1].endMinutes > sorted[index].startMinutes) {
      throw invalidBooking('Booking slots overlap.')
    }
  }

  const duration = slots.reduce((total, slot) => total + slot.hours, 0)
  if (input.duration !== duration || duration < 1 || duration > MAX_HOURLY_DURATION) {
    throw invalidBooking('Invalid booking duration.')
  }

  const amount = money(duration * rate)
  return {
    type: 'hourly',
    name: normalizeName(input.name),
    mobile: normalizeMobile(input.mobile),
    date,
    time: slots.map((slot) => `${slot.start} - ${slot.end}`).join(', '),
    duration,
    amount,
    slots: slots.map(({ start, end, hours, slotKeys }) => ({ start, end, hours, slotKeys })),
  }
}

function createReference() {
  return `T24-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-${crypto.randomBytes(16).toString('hex').toUpperCase()}`
}

function upiTransactionReference(session) {
  return crypto.createHash('sha256').update(session.reference).digest('hex').slice(0, 32)
}

function sessionResponse(session) {
  const upiId = String(session.upiId || '').trim() || 'Vyapar.176885106737@hdfcbank'
  const merchantName = String(session.merchantName || 'Turf').trim() || 'Turf'
  const amountUri = `upi://pay?pa=${upiId}&pn=${merchantName}&am=${session.amount.toFixed(2)}&cu=${session.currency}`
  const fallbackUri = `upi://pay?pa=${upiId}&pn=${merchantName}`

  const response = {
    reference: session.reference,
    amount: session.amount,
    currency: session.currency,
    paymentMode: session.paymentMode || 'UPI',
    upiId,
    merchantName,
    upiUri: amountUri,
    upiUriFallback: fallbackUri,
    status: session.status,
    expiresAt: session.expiresAt.toISOString(),
    razorpayKey: session.razorpayKey || null,
    razorpayOrderId: session.razorpayOrderId || null,
    razorpayAmount: session.razorpayAmount || null,
    razorpayCurrency: session.razorpayCurrency || null,
  }

  if (process.env.NODE_ENV !== 'production' && response.paymentMode === 'UPI') {
    console.info('[payment] UPI request', {
      pa: upiId,
      pn: merchantName,
      am: session.amount.toFixed(2),
      cu: session.currency,
      fallback: fallbackUri,
    })
  }

  return response
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' })
  }

  const type = req.body?.type
  const draftReference = String(req.body?.draftReference || '').trim()
  const idempotencyKey = String(req.body?.idempotencyKey || '').trim()
  if (!['hourly', 'extended'].includes(type)) return res.status(400).json({ message: 'Invalid payment type.' })
  if (!/^[A-Za-z0-9_-]{16,128}$/.test(idempotencyKey)) return res.status(400).json({ message: 'Invalid payment request.' })

  let db
  try {
    db = await getDb()
  } catch (error) {
    db = null
  }

  if (await isBookingBlocked(db)) {
    return res.status(403).json({ message: 'The bookings have been blocked.' })
  }

  const effectiveHourlyRate = await getConfiguredHourlyRate(db)

  let bookingData
  let amount
  try {
    if (type === 'hourly') {
      bookingData = normalizeHourlyBookingData(req.body, effectiveHourlyRate)
      amount = bookingData.amount
    } else {
      if (typeof req.body.days !== 'number' || !Number.isInteger(req.body.days) || req.body.days < 1 || req.body.days > 30) {
        throw invalidBooking('Invalid booking duration.')
      }
      amount = money(req.body.days * 8 * effectiveHourlyRate)
      bookingData = {
        type: 'extended',
        days: req.body.days,
        startDate: String(req.body.startDate || '').slice(0, 32),
        endDate: String(req.body.endDate || '').slice(0, 32),
        preferredTimes: Array.isArray(req.body.preferredTimes) ? req.body.preferredTimes.slice(0, 10).map((value) => String(value).slice(0, 32)) : [],
        name: String(req.body.name || '').slice(0, 120),
        mobile: String(req.body.mobile || '').replace(/\D/g, '').slice(0, 15),
        notes: String(req.body.notes || '').slice(0, 500),
      }
    }
  } catch (error) {
    if (error.code === 'INVALID_BOOKING') return res.status(400).json({ message: error.message })
    console.error('payment validation failed', error.message)
    return res.status(400).json({ message: 'Invalid payment request.' })
  }

  const reference = createReference()

  const paymentDetails = await getConfiguredPaymentDetails(db)
  const upiId = paymentDetails.upiId
  const merchantName = paymentDetails.merchantName

  const expiresAt = new Date(
    Date.now() + PAYMENT_TTL_MINUTES * 60 * 1000,
  )

  try {
    if (!db) db = await getDb()
    await db.collection('payment_sessions').createIndex(
      { idempotencyKey: 1 },
      { unique: true, sparse: true, name: 'idempotency_key_unique' },
    )

    const existing = await db.collection('payment_sessions').findOne({ idempotencyKey })
    if (existing) {
      if (existing.status !== 'PAYMENT_PENDING' || new Date(existing.expiresAt) <= new Date()) {
        return res.status(409).json({ message: 'This payment request has already been completed or expired.' })
      }
      if (JSON.stringify(existing.bookingData) !== JSON.stringify(bookingData)) {
        return res.status(409).json({ message: 'Payment request data does not match.' })
      }
      return res.status(200).json(sessionResponse(existing))
    }

    const razorpayOrder = await maybeCreateRazorpayOrder({ reference, bookingType: type, amount, currency: 'INR' })
    const session = {
      reference,
      bookingType: type,
      amount,
      currency: 'INR',
      upiId,
      status: 'PAYMENT_PENDING',
      expiresAt,
      idempotencyKey,
      bookingData,
      paymentMode: razorpayOrder?.paymentMode || 'UPI',
      razorpayKey: razorpayOrder?.razorpayKey || null,
      razorpayOrderId: razorpayOrder?.razorpayOrderId || null,
      razorpayAmount: razorpayOrder?.razorpayAmount || null,
      razorpayCurrency: razorpayOrder?.razorpayCurrency || null,
      ...(type === 'hourly' && draftReference ? { draftReference } : {}),
      createdAt: new Date(),
      updatedAt: new Date(),
      merchantName,
    }
    await db.collection('payment_sessions').insertOne(session)
    if (type === 'hourly') {
      const slotKeys = [...new Set(bookingData.slots.flatMap((slot) => slot.slotKeys))]
      await db.collection('bookings').createIndex(
        { paymentReference: 1 },
        { unique: true, name: 'payment_reference_unique' },
      )
      await db.collection('bookings').createIndex(
        { date: 1, slotKeys: 1 },
        { unique: true, sparse: true, name: 'date_slot_keys_unique' },
      )
      const pendingBooking = {
        name: bookingData.name,
        mobile: bookingData.mobile,
        date: bookingData.date,
        time: bookingData.time,
        duration: bookingData.duration,
        amount: bookingData.amount,
        paymentReference: reference,
        paymentStatus: 'PAYMENT_PENDING',
        bookingStatus: 'PENDING',
        slots: bookingData.slots,
        slotKeys,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
      }
      const draft = draftReference
        ? await db.collection('booking_drafts').findOne({ draftReference })
        : null
      const mergedBooking = draft?.bookingData ? { ...pendingBooking, ...draft.bookingData, paymentReference: reference, paymentStatus: 'PAYMENT_PENDING', bookingStatus: 'PENDING' } : pendingBooking
      if (draftReference) {
        const existingDraftBooking = await db.collection('bookings').findOne({ draftReference })
        if (existingDraftBooking) {
          await db.collection('bookings').updateOne(
            { _id: existingDraftBooking._id, paymentStatus: 'PAYMENT_PENDING' },
            { $set: { ...mergedBooking, updatedAt: session.updatedAt } },
          )
        } else {
          await db.collection('bookings').insertOne({ ...mergedBooking, draftReference })
        }
      } else {
        await db.collection('bookings').insertOne(mergedBooking)
      }
      if (draftReference) await db.collection('booking_drafts').updateOne({ draftReference }, { $set: { status: 'PAYMENT_PENDING', paymentReference: reference, updatedAt: session.updatedAt } })
    }
    return res.status(201).json(sessionResponse(session))
  } catch (error) {
    if (error.code === 11000) {
      const existing = await db?.collection('payment_sessions').findOne({ idempotencyKey })
      if (existing && existing.status === 'PAYMENT_PENDING' && new Date(existing.expiresAt) > new Date()) {
        return res.status(200).json(sessionResponse(existing))
      }
      return res.status(409).json({ message: 'Payment request is already being processed.' })
    }
    console.error('payment session persistence failed', error.message)

    return res.status(503).json({
      message: 'Payment setup is temporarily unavailable.',
    })
  }

}