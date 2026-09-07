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

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return jsonError(res, 405, 'Method not allowed')
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
