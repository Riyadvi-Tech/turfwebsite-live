import crypto from 'node:crypto'
import { getDb } from '../_lib/mongodb.js'
import { parseAdminSessionToken } from '../_lib/cookies.js'

const BOOKING_STATUSES = ['PENDING', 'CONFIRMED', 'CANCELLED', 'COMPLETED', 'NO_SHOW']
const PAYMENT_STATUSES = ['PAID', 'PAYMENT_PENDING', 'EXPIRED', 'FAILED']
const REPORT_TIMEZONE = '+05:30'

function sessionToken(req) {
  return parseAdminSessionToken(req)
}

async function requireAdmin(req, db) {
  const raw = sessionToken(req)
  if (!raw) return false
  const sessionTokenHash = crypto.createHash('sha256').update(raw).digest('hex')
  const session = await db.collection('admin_sessions').findOne({ sessionTokenHash })
  if (!session || (session.expiresAt && new Date(session.expiresAt) <= new Date())) return false
  const admin = await db.collection('admin_users').findOne({ _id: session.adminId, active: true }, { projection: { _id: 1 } })
  return Boolean(admin)
}

function isoDate(value, field) {
  const text = String(value || '')
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text)
  if (!match) throw new Error(`Invalid ${field}.`)
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])))
  if (date.getUTCFullYear() !== Number(match[1]) || date.getUTCMonth() !== Number(match[2]) - 1 || date.getUTCDate() !== Number(match[3])) throw new Error(`Invalid ${field}.`)
  return text
}

function addDay(value) {
  const date = new Date(`${value}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + 1)
  return date.toISOString().slice(0, 10)
}

function localStart(value) {
  return new Date(`${value}T00:00:00${REPORT_TIMEZONE}`)
}

function dateSeries(start, end) {
  const result = []
  for (let date = start; date <= end; date = addDay(date)) result.push(date)
  return result
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ message: 'Method not allowed' })
  try {
    const db = await getDb()
    if (!await requireAdmin(req, db)) return res.status(401).json({ message: 'Admin authentication required.' })

    const startDate = isoDate(req.query?.startDate, 'start date')
    const endDate = isoDate(req.query?.endDate, 'end date')
    if (endDate < startDate) return res.status(400).json({ message: 'Invalid date range.' })
    const days = dateSeries(startDate, endDate)
    if (days.length > 366) return res.status(400).json({ message: 'Date range is too large.' })
    const nextDate = addDay(endDate)

    const bookings = db.collection('bookings')
    const enquiries = db.collection('extended_enquiries')
    const whatsappEnquiries = db.collection('whatsapp_enquiries')
    const chatbotConversations = db.collection('chatbot_conversations')
    const payments = db.collection('payments')
    const paymentSessions = db.collection('payment_sessions')
    const paymentDateFilter = { createdAt: { $gte: localStart(startDate), $lt: localStart(nextDate) } }
    const createdBookingFilter = { createdAt: { $gte: localStart(startDate), $lt: localStart(nextDate) } }
    const bookingFilter = createdBookingFilter
    const hourlyBookingStages = [
      { $lookup: { from: 'payment_sessions', localField: 'paymentReference', foreignField: 'reference', as: 'paymentSession' } },
      { $match: { $or: [{ 'paymentSession.bookingType': 'hourly' }, { paymentSession: { $size: 0 } }] } },
    ]
    const paidRecordDate = { $ifNull: ['$paidAt', '$updatedAt'] }
    const paidRecordStages = [
      { $match: { status: 'PAID' } },
      { $project: { reference: 1, amount: 1, paidAt: 1, updatedAt: 1 } },
      {
        $unionWith: {
          coll: 'bookings',
          pipeline: [
            { $match: { paymentStatus: 'PAID' } },
            { $lookup: { from: 'payment_sessions', localField: 'paymentReference', foreignField: 'reference', as: 'paymentSession' } },
            { $match: { $expr: { $eq: [{ $size: '$paymentSession' }, 0] } } },
            { $project: { reference: '$paymentReference', amount: 1, paidAt: '$updatedAt', updatedAt: 1 } },
          ],
        },
      },
      {
        $match: {
          $expr: {
            $and: [
              { $gte: [paidRecordDate, localStart(startDate)] },
              { $lt: [paidRecordDate, localStart(nextDate)] },
            ],
          },
        },
      },
    ]
    const pendingRecordStages = [
      { $match: { status: 'PAYMENT_PENDING', expiresAt: { $gt: new Date() } } },
      { $project: { reference: 1, amount: 1, createdAt: 1 } },
      {
        $unionWith: {
          coll: 'bookings',
          pipeline: [
            { $match: { paymentStatus: 'PAYMENT_PENDING', bookingStatus: 'PENDING' } },
            { $lookup: { from: 'payment_sessions', localField: 'paymentReference', foreignField: 'reference', as: 'paymentSession' } },
            { $match: { $expr: { $eq: [{ $size: '$paymentSession' }, 0] } } },
            { $project: { reference: '$paymentReference', amount: 1, createdAt: 1 } },
          ],
        },
      },
      { $match: { createdAt: { $gte: localStart(startDate), $lt: localStart(nextDate) } } },
    ]

    const createdAtDailyStages = () => [
      { $match: { createdAt: { $gte: localStart(startDate), $lt: localStart(nextDate) } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: REPORT_TIMEZONE } }, count: { $sum: 1 } } },
    ]
    const [statusRows, dailyRows, dailyStatusRows, paidRows, dailyRevenueRows, paymentStatusRows, pendingRows, durationRows, dailyEnquiryRows, dailyWhatsappRows, dailyChatRows, dailyPendingRows, dailyCustomerRows] = await Promise.all([
      bookings.aggregate([{ $match: bookingFilter }, ...hourlyBookingStages, { $group: { _id: '$bookingStatus', count: { $sum: 1 } } }]).toArray(),
      bookings.aggregate([{ $match: bookingFilter }, ...hourlyBookingStages, { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: REPORT_TIMEZONE } }, count: { $sum: 1 }, duration: { $sum: '$duration' } } }]).toArray(),
      bookings.aggregate([{ $match: createdBookingFilter }, ...hourlyBookingStages, { $group: { _id: { date: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: REPORT_TIMEZONE } }, status: '$bookingStatus' }, count: { $sum: 1 } } }]).toArray(),
      paymentSessions.aggregate([...paidRecordStages, { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } }]).toArray(),
      paymentSessions.aggregate([
        ...paidRecordStages,
        { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: paidRecordDate, timezone: REPORT_TIMEZONE } }, revenue: { $sum: '$amount' } } },
      ]).toArray(),
      payments.aggregate([{ $match: { ...paymentDateFilter, status: { $in: PAYMENT_STATUSES } } }, { $group: { _id: '$status', count: { $sum: 1 } } }]).toArray(),
      paymentSessions.aggregate([
        ...pendingRecordStages,
        { $group: { _id: null, count: { $sum: 1 }, amount: { $sum: '$amount' } } },
      ]).toArray(),
      bookings.aggregate([{ $match: bookingFilter }, ...hourlyBookingStages, { $group: { _id: null, totalHours: { $sum: '$duration' } } }]).toArray(),
      enquiries.aggregate(createdAtDailyStages()).toArray(),
      whatsappEnquiries.aggregate(createdAtDailyStages()).toArray(),
      chatbotConversations.aggregate(createdAtDailyStages()).toArray(),
      paymentSessions.aggregate([
        ...pendingRecordStages,
        { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: REPORT_TIMEZONE } }, count: { $sum: 1 } } },
      ]).toArray(),
      bookings.aggregate([
        { $match: bookingFilter },
        ...hourlyBookingStages,
        { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: REPORT_TIMEZONE } }, customers: { $addToSet: '$mobile' } } },
      ]).toArray(),
    ])

    const statusCounts = Object.fromEntries(BOOKING_STATUSES.map((status) => [status, 0]))
    dailyStatusRows.forEach((row) => { if (Object.hasOwn(statusCounts, row._id.status)) statusCounts[row._id.status] += row.count })
    const paymentCounts = Object.fromEntries(PAYMENT_STATUSES.map((status) => [status, 0]))
    paymentStatusRows.forEach((row) => { if (Object.hasOwn(paymentCounts, row._id)) paymentCounts[row._id] = row.count })
    const dailyMap = Object.fromEntries(days.map((date) => [date, { date, bookings: 0, revenue: 0, duration: 0, enquiries: 0, whatsapp: 0, chat: 0, customers: 0, paymentPending: 0, statuses: { PENDING: 0, CONFIRMED: 0, CANCELLED: 0, COMPLETED: 0, NO_SHOW: 0 } }]))
    dailyRows.forEach((row) => { if (dailyMap[row._id]) dailyMap[row._id] = { ...dailyMap[row._id], bookings: row.count, duration: row.duration } })
    dailyRevenueRows.forEach((row) => { if (dailyMap[row._id]) dailyMap[row._id].revenue = row.revenue })
    dailyStatusRows.forEach((row) => { if (dailyMap[row._id.date]) { if (!dailyMap[row._id.date].statuses) dailyMap[row._id.date].statuses = { CONFIRMED: 0, CANCELLED: 0, COMPLETED: 0, NO_SHOW: 0 }; if (Object.hasOwn(dailyMap[row._id.date].statuses, row._id.status)) dailyMap[row._id.date].statuses[row._id.status] = row.count } })
    const completedByDate = {}
    dailyStatusRows.forEach((row) => {
      const status = row._id.status
      if (status === 'COMPLETED') completedByDate[row._id.date] = (completedByDate[row._id.date] || 0) + row.count
    })
    Object.entries(completedByDate).forEach(([date, count]) => {
      if (dailyMap[date]) dailyMap[date].statuses.COMPLETED = count
    })
    dailyEnquiryRows.forEach((row) => { if (dailyMap[row._id]) dailyMap[row._id].enquiries = row.count })
    dailyWhatsappRows.forEach((row) => { if (dailyMap[row._id]) dailyMap[row._id].whatsapp = row.count })
    dailyChatRows.forEach((row) => { if (dailyMap[row._id]) dailyMap[row._id].chat = row.count })
    dailyPendingRows.forEach((row) => { if (dailyMap[row._id]) dailyMap[row._id].paymentPending = row.count })
    dailyCustomerRows.forEach((row) => { if (dailyMap[row._id]) dailyMap[row._id].customers = row.customers.filter(Boolean).length })
    const daily = Object.values(dailyMap)
    const completedBookingCount = Object.values(completedByDate).reduce((total, count) => total + count, 0)
    const paidRevenue = Number(paidRows[0]?.total || 0)
    const paidBookingCount = Number(paidRows[0]?.count || 0)

    return res.status(200).json({
      range: { startDate, endDate },
      totals: {
        bookings: Object.values(statusCounts).reduce((sum, count) => sum + count, 0),
        confirmed: statusCounts.CONFIRMED,
        cancelled: statusCounts.CANCELLED,
        completed: completedBookingCount,
        noShow: statusCounts.NO_SHOW,
        paidRevenue,
        paidBookingCount,
        pendingPaymentCount: Number(pendingRows[0]?.count || 0),
        pendingPaymentAmount: Number(pendingRows[0]?.amount || 0),
        totalDuration: Number(durationRows[0]?.totalHours || 0),
      },
      bookingStatusCounts: statusCounts,
      paymentStatusCounts: paymentCounts,
      daily,
    })
  } catch (error) {
    if (/^Invalid /.test(error.message)) return res.status(400).json({ message: error.message })
    console.error('admin reports failed', error.message)
    return res.status(503).json({ message: 'Report data is temporarily unavailable.' })
  }
}
