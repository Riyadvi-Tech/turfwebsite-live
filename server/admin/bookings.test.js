import test from 'node:test'
import assert from 'node:assert/strict'
import { ObjectId } from 'mongodb'

import { deleteBookingRecord, syncPaymentStatusForBooking } from './bookings.js'

test('syncPaymentStatusForBooking marks both booking payment and payment records as paid', async () => {
  const calls = []
  const db = {
    collection: (name) => ({
      updateMany: async (filter, update) => {
        calls.push([name, filter, update])
        return { modifiedCount: 1 }
      },
    }),
  }

  const now = new Date('2026-09-23T10:00:00.000Z')
  await syncPaymentStatusForBooking(db, 'REF-2001', 'PAID', now)

  assert.deepEqual(calls[0][0], 'payment_sessions')
  assert.deepEqual(calls[0][2].$set.status, 'PAID')
  assert.deepEqual(calls[1][0], 'payments')
  assert.deepEqual(calls[1][2].$set.status, 'PAID')
  assert.deepEqual(calls[1][2].$set.paidAt, now)
})

test('deleteBookingRecord removes booking and payment references', async () => {
  const bookingId = new ObjectId()
  const paymentReference = 'REF-1001'

  const calls = []
  const db = {
    collection: (name) => ({
      findOne: async (filter, options) => {
        calls.push(['findOne', name, filter, options])
        if (name === 'bookings') {
          return { _id: bookingId, paymentReference }
        }
        return null
      },
      deleteOne: async (filter) => {
        calls.push(['deleteOne', name, filter])
        if (name === 'bookings') {
          return { deletedCount: 1 }
        }
        return { deletedCount: 0 }
      },
      deleteMany: async (filter) => {
        calls.push(['deleteMany', name, filter])
        if (name === 'payments' || name === 'payment_sessions') {
          return { deletedCount: 2 }
        }
        return { deletedCount: 0 }
      },
    })
  }

  const result = await deleteBookingRecord(db, bookingId.toHexString())

  assert.equal(result.deleted, true)
  assert.equal(result.bookingId, bookingId.toHexString())
  assert.equal(result.paymentRecordsDeleted, 4)
  assert.deepEqual(calls.some(([method, name]) => method === 'deleteOne' && name === 'bookings'), true)
})
