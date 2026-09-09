import { getDb } from './_lib/mongodb.js'
import { MaterializationError, materializeHourlyPayment } from './_lib/booking-materialization.js'

function jsonError(res, status, message) {
  return res.status(status).json({ success: false, message })
}

function bookingResponse(booking) {
  return {
    success: true,
    bookingId: String(booking._id),
    paymentReference: booking.paymentReference,
    amount: booking.amount,
    bookingStatus: booking.bookingStatus,
  }
}

function draftResponse(draft) {
  return {
    success: true,
    draftId: draft.draftReference,
    stage: draft.stage,
    status: draft.status,
  }
}

function cleanDraftData(data = {}) {
  return {
    name: String(data.name || '').trim().slice(0, 120),
    mobile: String(data.mobile || '').replace(/\D/g, '').slice(0, 15),
    date: String(data.date || '').slice(0, 10),
    dateLabel: String(data.dateLabel || '').slice(0, 80),
    duration: Number.isInteger(data.duration) ? data.duration : 0,
    start: String(data.start || '').slice(0, 40),
    end: String(data.end || '').slice(0, 40),
    slots: Array.isArray(data.slots) ? data.slots.slice(0, 5).map((slot) => ({
      start: String(slot?.start || '').slice(0, 40),
      end: String(slot?.end || '').slice(0, 40),
      hours: Number.isInteger(slot?.hours) ? slot.hours : 0,
    })) : [],
  }
}

function draftSlotKeys(data) {
  if (!data.date || !Array.isArray(data.slots)) return []
  return [...new Set(data.slots.flatMap((slot) => {
    if (!slot.start || !slot.end || !Number.isInteger(slot.hours) || slot.hours < 1) return []
    return Array.from({ length: slot.hours }, (_, index) => `${data.date}T${slot.start}#${index}`)
  }))]
}

function slotStartKey(date, slot) {
  const value = String(slot?.start || '').trim()
  const match24 = /^(\d{1,2}):(\d{2})$/.exec(value)
  if (match24) return `${date}T${String(Number(match24[1])).padStart(2, '0')}:${match24[2]}`
  const match12 = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec(value)
  if (!match12) return null
  let hour = Number(match12[1]) % 12
  if (match12[3].toUpperCase() === 'PM') hour += 12
  return `${date}T${String(hour).padStart(2, '0')}:${match12[2]}`
}

function timeMinutes(value) {
  const text = String(value || '').trim()
  const match24 = /^(\d{1,2}):(\d{2})$/.exec(text)
  if (match24) return Number(match24[1]) * 60 + Number(match24[2])
  const match12 = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec(text)
  if (!match12) return null
  let hour = Number(match12[1]) % 12
  if (match12[3].toUpperCase() === 'PM') hour += 12
  return hour * 60 + Number(match12[2])
}

function storedSlotKeys(date, booking) {
  const hasSlots = Array.isArray(booking.slots) && booking.slots.length
  if (!hasSlots && Array.isArray(booking.slotKeys) && booking.slotKeys.length) return booking.slotKeys
  const slots = hasSlots
    ? booking.slots
    : timeMinutes(booking.time) !== null
      ? [{ start: booking.time, hours: Number(booking.duration || 0) }]
      : String(booking.time || '').split(',').map((range) => {
      const match = /^\s*(.*?)\s*-\s*(.*?)\s*$/.exec(range)
      const start = timeMinutes(match?.[1])
      const end = timeMinutes(match?.[2])
      return start !== null && end !== null && end > start
        ? { start: match[1], hours: (end - start) / 60 }
        : null
      }).filter(Boolean)
  return slots
    .flatMap((slot) => {
      const startKey = slotStartKey(date, slot)
      const hours = Number(slot?.hours || booking.duration || 0)
      if (!startKey || !Number.isInteger(hours) || hours < 1) return []
      const [hour, minute] = startKey.slice(11).split(':').map(Number)
      return Array.from({ length: hours }, (_, offset) => `${date}T${String(hour + offset).padStart(2, '0')}:${String(minute).padStart(2, '0')}`)
    })
}

function recordSlotKeys(date, record) {
  return storedSlotKeys(date, record).length
    ? storedSlotKeys(date, record)
    : storedSlotKeys(date, { slots: record.bookingData?.slots })
}

function nextDateKey(value) {
  const date = new Date(`${value}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + 1)
  return date.toISOString().slice(0, 10)
}

export default async function handler(req, res) {
  if (req.method === 'GET') {
    const date = String(req.query?.date || '').trim()
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return jsonError(res, 400, 'A valid date is required.')

    try {
      const db = await getDb()
      const followingDate = nextDateKey(date)
      const [bookings, sessions] = await Promise.all([
        db.collection('bookings').find(
          { date: { $in: [date, followingDate] } },
          { projection: { paymentReference: 1, bookingStatus: 1, slotKeys: 1, slots: 1, time: 1, duration: 1 } },
        ).toArray(),
        db.collection('payment_sessions').find(
          { 'bookingData.date': { $in: [date, followingDate] }, status: { $in: ['PAYMENT_PENDING', 'PAID'] } },
          { projection: { reference: 1, bookingData: 1 } },
        ).toArray(),
      ])
      const cancelledReferences = new Set(bookings.filter((booking) => booking.bookingStatus === 'CANCELLED').map((booking) => booking.paymentReference).filter(Boolean))
      const activeBookings = bookings.filter((booking) => booking.bookingStatus !== 'CANCELLED')
      const activeReferences = new Set(activeBookings.map((booking) => booking.paymentReference).filter(Boolean))
      const occupiedSlotKeys = [...new Set([
        ...activeBookings.flatMap((booking) => recordSlotKeys(booking.date || date, booking)),
        ...sessions.filter((session) => !cancelledReferences.has(session.reference) && !activeReferences.has(session.reference)).flatMap((session) => recordSlotKeys(session.bookingData?.date || date, session)),
      ])]
      return res.status(200).json({ date, occupiedSlotKeys })
    } catch (error) {
      console.error('booking availability lookup failed', error.message)
      return jsonError(res, 503, 'Unable to load slot availability right now.')
    }
  }

  if (req.method !== 'POST') {
    return jsonError(res, 405, 'Method not allowed')
  }

  if (req.body?.action === 'save-draft') {
    const draftReference = String(req.body?.draftReference || '').trim()
    if (!/^BK-[A-Z0-9-]{12,100}$/.test(draftReference)) return jsonError(res, 400, 'Invalid booking draft.')

    try {
      const db = await getDb()
      await db.collection('booking_drafts').createIndex(
        { draftReference: 1 },
        { unique: true, name: 'draft_reference_unique' },
      )
      const now = new Date()
      const bookingData = cleanDraftData(req.body?.data)
      const draft = await db.collection('booking_drafts').findOneAndUpdate(
        { draftReference },
        {
          $set: {
            draftReference,
            type: 'hourly',
            stage: Number.isInteger(req.body?.stage) ? Math.min(7, Math.max(1, req.body.stage)) : 1,
            status: 'PENDING',
            bookingData,
            updatedAt: now,
          },
          $setOnInsert: { createdAt: now },
        },
        { upsert: true, returnDocument: 'after' },
      )
      await db.collection('bookings').createIndex(
        { draftReference: 1 },
        { unique: true, sparse: true, name: 'draft_reference_unique' },
      )
      await db.collection('bookings').updateOne(
        { draftReference },
        {
          $set: {
            draftReference,
            name: bookingData.name,
            mobile: bookingData.mobile,
            date: bookingData.date,
            time: bookingData.slots.map((slot) => `${slot.start} - ${slot.end}`).join(', ') || bookingData.start || '',
            duration: bookingData.duration,
            amount: bookingData.duration * 800,
            slots: bookingData.slots,
            slotKeys: draftSlotKeys(bookingData),
            paymentStatus: 'PAYMENT_PENDING',
            bookingStatus: 'PENDING',
            updatedAt: now,
          },
          $setOnInsert: { createdAt: now },
        },
        { upsert: true },
      )
      return res.status(200).json(draftResponse(draft))
    } catch (error) {
      console.error('booking draft persistence failed', error.message)
      return jsonError(res, 503, 'Unable to save booking details right now.')
    }
  }

  const paymentReference = String(req.body?.paymentReference || '').trim()
  if (!paymentReference || paymentReference.length > 100) {
    return jsonError(res, 400, 'Payment reference is required.')
  }

  try {
    const result = await materializeHourlyPayment(await getDb(), paymentReference)
    return res.status(result.created ? 201 : 200).json(bookingResponse(result.booking))
  } catch (error) {
    if (error instanceof MaterializationError) {
      const status = error.code === 'NOT_FOUND' ? 404 : ['NOT_PAID', 'NOT_HOURLY', 'SLOT_UNAVAILABLE', 'PAYMENT_CONFLICT', 'BOOKING_CONFLICT', 'AMOUNT_CONFLICT'].includes(error.code) ? 409 : 400
      return jsonError(res, status, error.message)
    }
    if (error?.code === 11000) return jsonError(res, 409, 'The selected time slot is no longer available.')

    console.error('booking persistence failed', error.message)
    return jsonError(res, 503, 'Unable to save the booking right now.')
  }
}
