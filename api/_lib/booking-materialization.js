import { getMongoClient } from './mongodb.js'
import { normalizeHourlyBookingData } from '../payment/create.js'
import { assertOtpAuthorization } from './otp-authorization.js'

export class MaterializationError extends Error {
  constructor(code, message) {
    super(message)
    this.code = code
  }
}

function responseFor(booking, created) {
  return {
    booking,
    created,
    paymentReference: booking.paymentReference,
    bookingId: String(booking._id),
    amount: booking.amount,
    bookingStatus: booking.bookingStatus,
  }
}

function assertPaymentCompatibility(payment, amount, currency, bookingId) {
  if (!payment) return
  if (
    Number(payment.amount) !== amount ||
    payment.currency !== currency ||
    payment.status !== 'PAID' ||
    (payment.bookingId && String(payment.bookingId) !== String(bookingId || ''))
  ) {
    throw new MaterializationError('PAYMENT_CONFLICT', 'The payment record does not match this booking.')
  }
}

function assertBookingCompatibility(booking, normalized) {
  if (
    booking.mobile !== normalized.mobile ||
    booking.date !== normalized.date ||
    booking.time !== normalized.time ||
    booking.duration !== normalized.duration ||
    Number(booking.amount) !== normalized.amount ||
    booking.bookingStatus !== 'CONFIRMED' ||
    booking.paymentStatus !== 'PAID'
  ) {
    throw new MaterializationError('BOOKING_CONFLICT', 'The existing booking does not match the payment.')
  }
}

export async function materializeHourlyPayment(db, reference, { transitionToPaid = false } = {}) {
  const client = await getMongoClient()
  const bookings = db.collection('bookings')
  await bookings.createIndex(
    { date: 1, slotKeys: 1 },
    { unique: true, sparse: true, name: 'date_slot_keys_unique' },
  )

  const session = client.startSession()
  let result
  try {
    await session.withTransaction(async () => {
      const paymentSession = await db.collection('payment_sessions').findOne(
        { reference },
        { session },
      )
      if (!paymentSession) throw new MaterializationError('NOT_FOUND', 'Payment session not found.')
      if (paymentSession.bookingType !== 'hourly') {
        throw new MaterializationError('NOT_HOURLY', 'This payment is not an hourly booking.')
      }
      if (!['PAID', 'PAYMENT_PENDING'].includes(paymentSession.status)) {
        throw new MaterializationError('INVALID_STATE', `Payment session is ${paymentSession.status}.`)
      }
      if (
        transitionToPaid &&
        paymentSession.status === 'PAYMENT_PENDING' &&
        new Date(paymentSession.expiresAt) <= new Date()
      ) {
        throw new MaterializationError('EXPIRED', 'Payment session has expired.')
      }
      if (!transitionToPaid && paymentSession.status !== 'PAID') {
        throw new MaterializationError('NOT_PAID', 'Payment has not been verified.')
      }

      let normalized
      try {
        normalized = normalizeHourlyBookingData(paymentSession.bookingData)
      } catch (error) {
        if (error.code === 'INVALID_BOOKING') {
          throw new MaterializationError('INVALID_BOOKING', error.message)
        }
        throw error
      }

      if (paymentSession.currency !== 'INR' || Number(paymentSession.amount) !== normalized.amount) {
        throw new MaterializationError('AMOUNT_CONFLICT', 'Payment amount does not match the booking.')
      }

      const now = new Date()
      try {
        assertOtpAuthorization(paymentSession.otpAuthorization, normalized.mobile, now)
      } catch (error) {
        throw new MaterializationError('OTP_NOT_VERIFIED', error.message)
      }
      const existingBooking = await bookings.findOne(
        { paymentReference: reference },
        { session },
      )
      const existingPayment = await db.collection('payments').findOne(
        { paymentReference: reference },
        { session },
      )

      if (existingBooking) {
        assertBookingCompatibility(existingBooking, normalized)
        assertPaymentCompatibility(existingPayment, normalized.amount, paymentSession.currency, existingBooking._id)

        if (transitionToPaid && paymentSession.status === 'PAYMENT_PENDING') {
          await db.collection('payment_sessions').updateOne(
            { _id: paymentSession._id, status: 'PAYMENT_PENDING' },
            { $set: { status: 'PAID', paidAt: now, updatedAt: now } },
            { session },
          )
        }

        if (!existingPayment) {
          await db.collection('payments').insertOne({
            bookingId: existingBooking._id,
            paymentReference: reference,
            amount: normalized.amount,
            currency: paymentSession.currency,
            status: 'PAID',
            method: paymentSession.bookingData?.method || 'UPI',
            verifiedAt: now,
            createdAt: now,
            updatedAt: now,
          }, { session })
        }
        result = responseFor(existingBooking, false)
        return
      }

      assertPaymentCompatibility(existingPayment, normalized.amount, paymentSession.currency)

      const requestedKeys = new Set(normalized.slots.flatMap((slot) => slot.slotKeys))
      const existingBookings = await bookings.find(
        { date: normalized.date, paymentReference: { $ne: reference } },
        { session, projection: { slotKeys: 1 } },
      ).toArray()
      if (existingBookings.some((booking) => (booking.slotKeys || []).some((key) => requestedKeys.has(key)))) {
        throw new MaterializationError('SLOT_UNAVAILABLE', 'The selected time slot is no longer available.')
      }

      if (transitionToPaid && paymentSession.status === 'PAYMENT_PENDING') {
        const stateChange = await db.collection('payment_sessions').updateOne(
          { _id: paymentSession._id, status: 'PAYMENT_PENDING', expiresAt: { $gt: now } },
          { $set: { status: 'PAID', paidAt: now, updatedAt: now } },
          { session },
        )
        if (stateChange.matchedCount !== 1) {
          throw new MaterializationError('INVALID_STATE', 'Payment session is no longer pending.')
        }
      }

      const bookingDocument = {
        mobile: normalized.mobile,
        date: normalized.date,
        time: normalized.time,
        duration: normalized.duration,
        amount: normalized.amount,
        paymentReference: reference,
        paymentStatus: 'PAID',
        bookingStatus: 'CONFIRMED',
        slots: normalized.slots,
        slotKeys: [...requestedKeys],
        createdAt: now,
        updatedAt: now,
      }
      const bookingInsert = await bookings.insertOne(bookingDocument, { session })
      const booking = { ...bookingDocument, _id: bookingInsert.insertedId }

      await db.collection('payments').updateOne(
        { paymentReference: reference },
        {
          $set: {
            bookingId: bookingInsert.insertedId,
            paymentReference: reference,
            amount: normalized.amount,
            currency: paymentSession.currency,
            status: 'PAID',
            method: paymentSession.bookingData?.method || 'UPI',
            verifiedAt: now,
            updatedAt: now,
          },
          $setOnInsert: { createdAt: now },
        },
        { upsert: true, session },
      )

      await db.collection('customers').updateOne(
        { mobile: normalized.mobile },
        {
          $set: { mobile: normalized.mobile, updatedAt: now },
          $setOnInsert: { createdAt: now, totalBookings: 0, totalSpent: 0 },
          $inc: { totalBookings: 1, totalSpent: normalized.amount },
        },
        { upsert: true, session },
      )

      result = responseFor(booking, true)
    })
  } catch (error) {
    if (error?.code === 11000) {
      throw new MaterializationError('SLOT_UNAVAILABLE', 'The selected time slot is no longer available.')
    }
    throw error
  } finally {
    await session.endSession()
  }

  return result
}
