import crypto from 'node:crypto'
import { getDb } from '../_lib/mongodb.js'

function sessionToken(req) {
  return req.headers.cookie?.match(/(?:^|; )turfon24_admin_session=([^;]+)/)?.[1]
}

async function requireAdmin(req, db) {
  const raw = sessionToken(req)
  if (!raw) return false

  const sessionTokenHash = crypto.createHash('sha256').update(raw).digest('hex')
  const session = await db.collection('admin_sessions').findOne({ sessionTokenHash })
  if (!session || (session.expiresAt && new Date(session.expiresAt) <= new Date())) return false

  const admin = await db.collection('admin_users').findOne(
    { _id: session.adminId, active: true },
    { projection: { _id: 1 } },
  )
  return Boolean(admin)
}

function dayBounds() {
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  return { start, end: new Date(start.getTime() + 86400000) }
}

function safeBooking(booking) {
  return {
    id: String(booking._id),
    mobile: booking.mobile || null,
    date: booking.date || null,
    time: booking.time || null,
    duration: booking.duration || 0,
    amount: Number(booking.amount || 0),
    paymentStatus: booking.paymentStatus || null,
    bookingStatus: booking.bookingStatus || null,
    createdAt: booking.createdAt || null,
  }
}

function safeEnquiry(enquiry) {
  return {
    id: String(enquiry._id),
    mobile: enquiry.mobile || null,
    startDate: enquiry.startDate || null,
    endDate: enquiry.endDate || null,
    status: enquiry.status || null,
    summary: enquiry.summary || null,
    createdAt: enquiry.createdAt || null,
  }
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ message: 'Method not allowed' })

  try {
    const db = await getDb()
    if (!await requireAdmin(req, db)) return res.status(401).json({ message: 'Admin authentication required.' })

    const { start, end } = dayBounds()
    const bookings = db.collection('bookings')
    const payments = db.collection('payments')
    const customers = db.collection('customers')
    const enquiries = db.collection('extended_enquiries')
    const paymentSessions = db.collection('payment_sessions')

    const [
      totalBookings,
      todayBookings,
      pendingBookings,
      confirmedBookings,
      cancelledBookings,
      completedBookings,
      totalCustomers,
      pendingPayments,
      newEnquiries,
      paidRevenue,
      recentBookings,
      recentEnquiries,
      recentPayments,
      whatsappEnquiries,
      chatbotConversations,
    ] = await Promise.all([
      bookings.countDocuments({}),
      bookings.countDocuments({ createdAt: { $gte: start, $lt: end } }),
      paymentSessions.aggregate([
        { $match: { bookingType: 'hourly', status: 'PAID' } },
        { $lookup: { from: 'bookings', localField: 'reference', foreignField: 'paymentReference', as: 'bookings' } },
        { $match: { bookings: { $size: 0 } } },
        { $count: 'count' },
      ]).toArray(),
      bookings.countDocuments({ bookingStatus: 'CONFIRMED' }),
      bookings.countDocuments({ bookingStatus: 'CANCELLED' }),
      bookings.countDocuments({ bookingStatus: 'COMPLETED' }),
      customers.countDocuments({}),
      paymentSessions.countDocuments({ bookingType: 'hourly', status: 'PAYMENT_PENDING', expiresAt: { $gt: new Date() } }),
      enquiries.countDocuments({ status: { $in: ['new', 'contacted'] } }),
      bookings.aggregate([
        { $match: { bookingStatus: { $in: ['CONFIRMED', 'COMPLETED', 'NO_SHOW'] }, paymentStatus: 'PAID' } },
        { $lookup: { from: 'payment_sessions', localField: 'paymentReference', foreignField: 'reference', as: 'paymentSession' } },
        { $match: { 'paymentSession.bookingType': 'hourly' } },
        { $lookup: { from: 'payments', let: { reference: '$paymentReference', bookingId: '$_id', amount: '$amount' }, pipeline: [
          { $match: { status: 'PAID' } },
          { $match: { $expr: { $and: [
            { $eq: ['$paymentReference', '$$reference'] },
            { $eq: ['$bookingId', '$$bookingId'] },
            { $eq: ['$amount', '$$amount'] },
          ] } } },
        ], as: 'verifiedPayment' } },
        { $match: { $expr: { $gt: [{ $size: '$verifiedPayment' }, 0] } } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]).toArray(),
      bookings.find({}, { projection: { mobile: 1, date: 1, time: 1, duration: 1, amount: 1, paymentStatus: 1, bookingStatus: 1, createdAt: 1 } }).sort({ createdAt: -1, _id: -1 }).limit(8).toArray(),
      enquiries.find({}, { projection: { mobile: 1, startDate: 1, endDate: 1, status: 1, summary: 1, createdAt: 1 } }).sort({ createdAt: -1, _id: -1 }).limit(5).toArray(),
      payments.find({ status: 'PAID' }, { projection: { paymentReference: 1, amount: 1, verifiedAt: 1, createdAt: 1 } }).sort({ verifiedAt: -1, createdAt: -1 }).limit(5).toArray(),
      db.collection('whatsapp_enquiries').countDocuments({}),
      db.collection('chatbot_conversations').countDocuments({}),
    ])

    const activity = [
      ...recentBookings.map((booking) => ({ type: 'booking', text: `Hourly booking ${String(booking._id)} — ${booking.bookingStatus || 'recorded'}`, createdAt: booking.createdAt || null })),
      ...recentEnquiries.map((enquiry) => ({ type: 'enquiry', text: `Extended enquiry ${String(enquiry._id)} — ${enquiry.status || 'new'}`, createdAt: enquiry.createdAt || null })),
      ...recentPayments.map((payment) => ({ type: 'payment', text: `Payment verified — ₹${Number(payment.amount || 0).toLocaleString('en-IN')}`, createdAt: payment.verifiedAt || payment.createdAt || null })),
    ].sort((left, right) => new Date(right.createdAt || 0) - new Date(left.createdAt || 0)).slice(0, 10)

    return res.status(200).json({
      stats: {
        totalBookings,
        todayBookings,
        pendingBookings: Number(pendingBookings[0]?.count || 0),
        confirmedBookings,
        cancelledBookings,
        completedBookings,
        totalCustomers,
        pendingPayments,
        newEnquiries,
        activeEnquiries: newEnquiries,
        totalRevenue: Number(paidRevenue[0]?.total || 0),
        whatsappEnquiries,
        chatbotConversations,
      },
      recentBookings: recentBookings.map(safeBooking),
      recentActivity: activity,
    })
  } catch (error) {
    console.error('admin dashboard failed', error.message)
    return res.status(503).json({ message: 'Dashboard data is temporarily unavailable.' })
  }
}
