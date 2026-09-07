import { getDb } from '../_lib/mongodb.js'
import { MaterializationError, materializeHourlyPayment } from '../_lib/booking-materialization.js'

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method not allowed' })
  }

  const reference = String(req.query?.reference || '').trim()

  if (!/^T24-\d{8}-[A-F0-9]{8}(?:[A-F0-9]{24})?$/i.test(reference)) {
    return res.status(400).json({
      message: 'Payment reference is required.',
    })
  }

  try {
    const db = await getDb()

    const session = await db.collection('payment_sessions').findOne({
      reference,
    })

    if (!session) {
      return res.status(404).json({
        message: 'Payment session not found.',
      })
    }

    if (
      session.status === 'PAYMENT_PENDING' &&
      new Date(session.expiresAt) <= new Date()
    ) {
      await db.collection('payment_sessions').updateOne(
        {
          reference,
          status: 'PAYMENT_PENDING',
        },
        {
          $set: {
            status: 'EXPIRED',
            updatedAt: new Date(),
          },
        },
      )

      session.status = 'EXPIRED'
    }

    if (session.status === 'PAID' && session.bookingType === 'hourly') {
      try {
        const materialized = await materializeHourlyPayment(db, reference)
        return res.status(200).json({
          reference: session.reference,
          amount: session.amount,
          currency: session.currency,
          status: session.status,
          bookingId: materialized.bookingId,
          materialized: true,
          expiresAt: new Date(session.expiresAt).toISOString(),
        })
      } catch (error) {
        if (error instanceof MaterializationError && error.code === 'SLOT_UNAVAILABLE') {
          return res.status(409).json({
            reference: session.reference,
            amount: session.amount,
            currency: session.currency,
            status: session.status,
            materialization: 'SLOT_UNAVAILABLE',
            message: 'Payment was verified, but the selected slot is no longer available.',
            expiresAt: new Date(session.expiresAt).toISOString(),
          })
        }
        throw error
      }
    }

    return res.status(200).json({
      reference: session.reference,
      amount: session.amount,
      currency: session.currency,
      status: session.status,
      expiresAt: new Date(session.expiresAt).toISOString(),
    })
  } catch (error) {
    console.error('payment status lookup failed', error.message)

    return res.status(503).json({
      message: 'Payment status is temporarily unavailable.',
    })
  }
}