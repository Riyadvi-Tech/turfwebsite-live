import crypto from 'node:crypto'
import { getDb } from '../_lib/mongodb.js'
import { parseAdminSessionToken } from '../_lib/cookies.js'

function sessionToken(req) {
  return parseAdminSessionToken(req)
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
    const todayKey = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(start.getDate()).padStart(2, '0')}`
    const bookings = db.collection('bookings')
    const payments = db.collection('payments')
    const enquiries = db.collection('extended_enquiries')
    const paymentSessions = db.collection('payment_sessions')

    const [
      totalBookings,
      todayBookings,
      pendingBookings,
      confirmedBookings,
      cancelledBookings,
      completedBookings,
      bookingMobiles,
      enquiryMobiles,
      pendingPayments,
      totalEnquiries,
      paidRevenue,
      recentBookings,
      recentEnquiries,
      recentPayments,
      recentChatbotConversations,
      recentWhatsappEnquiries,
      whatsappEnquiries,
      chatbotConversations,
    ] = await Promise.all([
      bookings.countDocuments({}),
      bookings.countDocuments({ createdAt: { $gte: start, $lt: end } }),
      bookings.countDocuments({ bookingStatus: 'PENDING' }),
      bookings.countDocuments({ bookingStatus: 'CONFIRMED' }),
      bookings.countDocuments({ bookingStatus: 'CANCELLED' }),
      bookings.countDocuments({
        $or: [
          { bookingStatus: 'COMPLETED' },
          { bookingStatus: 'CONFIRMED', date: { $lt: todayKey } },
        ],
      }),
      bookings.distinct('mobile', { mobile: { $nin: [null, ''] } }),
      enquiries.distinct('mobile', { mobile: { $nin: [null, ''] } }),
      Promise.all([
        paymentSessions.find(
          { status: 'PAYMENT_PENDING', expiresAt: { $gt: new Date() } },
          { projection: { reference: 1 } },
        ).toArray(),
        paymentSessions.distinct('reference'),
        bookings.find(
          { paymentStatus: 'PAYMENT_PENDING', bookingStatus: 'PENDING' },
          { projection: { paymentReference: 1 } },
        ).toArray(),
      ]).then(([activeSessions, sessionReferences, pendingBookings]) => {
        const activeReferences = new Set(activeSessions.map((session) => session.reference))
        const unmatchedBookings = pendingBookings.filter((booking) => !sessionReferences.includes(booking.paymentReference))
        return activeReferences.size + unmatchedBookings.length
      }),
      enquiries.countDocuments({}),
      bookings.aggregate([
        { $match: { paymentStatus: 'PAID', bookingStatus: { $in: ['CONFIRMED', 'COMPLETED', 'NO_SHOW'] } } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]).toArray(),
      bookings.find({}, { projection: { name: 1, mobile: 1, date: 1, time: 1, duration: 1, amount: 1, paymentStatus: 1, bookingStatus: 1, createdAt: 1 } }).sort({ createdAt: -1, _id: -1 }).limit(8).toArray(),
      enquiries.find({}, { projection: { name: 1, mobile: 1, startDate: 1, endDate: 1, status: 1, summary: 1, createdAt: 1 } }).sort({ createdAt: -1, _id: -1 }).limit(5).toArray(),
      payments.find({ status: 'PAID' }, { projection: { paymentReference: 1, amount: 1, verifiedAt: 1, createdAt: 1 } }).sort({ verifiedAt: -1, createdAt: -1 }).limit(5).toArray(),
      db.collection('chatbot_conversations').find({}, { projection: { name: 1, lastMessage: 1, messages: 1, status: 1, createdAt: 1, updatedAt: 1 } }).sort({ updatedAt: -1, createdAt: -1, _id: -1 }).limit(5).toArray(),
      db.collection('whatsapp_enquiries').find({}, { projection: { name: 1, message: 1, status: 1, createdAt: 1, updatedAt: 1 } }).sort({ updatedAt: -1, createdAt: -1, _id: -1 }).limit(5).toArray(),
      db.collection('whatsapp_enquiries').countDocuments({}),
      db.collection('chatbot_conversations').countDocuments({}),
    ])

    const totalCustomers = new Set([...bookingMobiles, ...enquiryMobiles]).size

    const activity = [
      ...recentBookings.map((booking) => ({ type: 'booking', text: `Hourly booking — ${String(booking.name || 'Customer')} — ${String(booking.bookingStatus || 'recorded').toUpperCase()}`, createdAt: booking.createdAt || null })),
      ...recentEnquiries.map((enquiry) => {
        const rawStatus = String(enquiry.status || 'new').trim().toLowerCase()
        const safeStatus = rawStatus || 'new'
        return {
          type: 'enquiry',
          text: `Extended enquiry — ${String(enquiry.name || 'Customer')} — ${String(safeStatus).toUpperCase()}`,
          createdAt: enquiry.createdAt || null,
        }
      }),
      ...recentPayments.map((payment) => ({ type: 'payment', text: `Payment verified — ₹${Number(payment.amount || 0).toLocaleString('en-IN')}`, createdAt: payment.verifiedAt || payment.createdAt || null })),
      ...recentChatbotConversations.map((conversation) => {
        const messages = Array.isArray(conversation.messages) ? conversation.messages : []
        const lastMessage = String(conversation.lastMessage || messages[messages.length - 1]?.message || '').trim()
        const customer = String(conversation.name || 'Visitor').trim()
        const rawStatus = String(conversation.status || 'new').trim().toLowerCase()
        const status = rawStatus === 'old' ? 'CONTACTED' : rawStatus === 'contacted' ? 'CONTACTED' : 'NEW'
        return {
          type: 'chat',
          text: `AI chat — ${customer}${lastMessage ? `: ${lastMessage}` : ' — new conversation'} — ${status}`,
          createdAt: conversation.updatedAt || conversation.createdAt || null,
        }
      }),
      ...recentWhatsappEnquiries.map((enquiry) => {
        const rawStatus = String(enquiry.status || 'new').trim().toLowerCase()
        const status = rawStatus === 'old' || rawStatus === 'contacted' ? 'CONTACTED' : 'NEW'
        const customer = String(enquiry.name || 'Visitor').trim()
        const message = String(enquiry.message || '').trim()
        return {
          type: 'whatsapp',
          text: `WhatsApp enquiry — ${customer}${message ? `: ${message}` : ' — new enquiry'} — ${status}`,
          createdAt: enquiry.updatedAt || enquiry.createdAt || null,
        }
      }),
    ].sort((left, right) => new Date(right.createdAt || 0) - new Date(left.createdAt || 0)).slice(0, 10)

    return res.status(200).json({
      stats: {
        totalBookings,
        todayBookings,
        pendingBookings,
        confirmedBookings,
        cancelledBookings,
        completedBookings,
        totalCustomers,
        pendingPayments,
        newEnquiries: totalEnquiries,
        activeEnquiries: totalEnquiries,
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
