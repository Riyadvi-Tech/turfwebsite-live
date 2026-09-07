import crypto from 'node:crypto'
import { ObjectId } from 'mongodb'
import { getDb } from '../_lib/mongodb.js'

const SORT_FIELDS = new Set(['createdAt', 'updatedAt', 'totalBookings', 'totalSpent', 'mobile'])

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

function parseId(value) {
  return ObjectId.isValid(value) ? new ObjectId(value) : null
}

function safeSearch(value) {
  return String(value || '').trim().slice(0, 100).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function parsePagination(query) {
  const page = Number(query.page || 1)
  const limit = Number(query.limit || 25)
  if (!Number.isInteger(page) || page < 1 || !Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error('Invalid pagination.')
  return { page, limit }
}

function parseSort(query) {
  const field = String(query.sort || 'createdAt')
  if (!SORT_FIELDS.has(field)) throw new Error('Invalid sort field.')
  const direction = String(query.direction || 'desc').toLowerCase()
  if (!['asc', 'desc'].includes(direction)) throw new Error('Invalid sort direction.')
  return { [field]: direction === 'asc' ? 1 : -1, _id: -1 }
}

function safeCustomer(customer, includeHistory = true) {
  const result = {
    _id: String(customer._id),
    name: customer.name || null,
    mobile: customer.mobile || null,
    totalBookings: Number(customer.totalBookings || 0),
    totalSpent: Number(customer.totalSpent || 0),
    createdAt: customer.createdAt || null,
    updatedAt: customer.updatedAt || null,
  }
  if (includeHistory) {
    result.hourlyHistory = (customer.hourlyHistory || []).map((booking) => ({
      date: booking.date || null,
      time: booking.time || null,
      duration: booking.duration || 0,
      amount: Number(booking.amount || 0),
      status: booking.bookingStatus || null,
    }))
    result.extendedHistory = (customer.extendedHistory || []).map((enquiry) => ({
      startDate: enquiry.startDate || null,
      endDate: enquiry.endDate || null,
      preferredTime: enquiry.preferredTime || null,
      status: enquiry.status || null,
      name: enquiry.name || String(enquiry.summary || '').split(' extended booking enquiry for ')[0] || null,
      message: enquiry.requirements || enquiry.message || enquiry.summary || null,
    }))
  }
  return result
}

function extendedOnlyCustomer(enquiries) {
  const first = enquiries[0] || {}
  return {
    _id: `extended-${first.mobile}`,
    mobile: first.mobile || null,
    name: first.name || null,
    totalBookings: 0,
    totalSpent: 0,
    createdAt: first.createdAt || null,
    updatedAt: first.updatedAt || first.createdAt || null,
    hourlyHistory: [],
    extendedHistory: enquiries.map((enquiry) => ({
      startDate: enquiry.startDate || null,
      endDate: enquiry.endDate || null,
      preferredTime: enquiry.preferredTime || null,
      status: enquiry.status || null,
      name: enquiry.name || String(enquiry.summary || '').split(' extended booking enquiry for ')[0] || null,
      message: enquiry.requirements || enquiry.message || enquiry.summary || null,
    })),
  }
}

function hourlyOnlyCustomer(bookings) {
  const first = bookings[0] || {}
  return {
    _id: `hourly-${first.mobile}`,
    name: first.name || first.customerName || null,
    mobile: first.mobile || null,
    totalBookings: bookings.length,
    totalSpent: bookings.reduce((total, booking) => total + Number(booking.amount || 0), 0),
    createdAt: first.createdAt || null,
    updatedAt: first.updatedAt || first.createdAt || null,
    hourlyHistory: bookings.map((booking) => ({
      date: booking.date || null,
      time: booking.time || null,
      duration: booking.duration || 0,
      amount: Number(booking.amount || 0),
      bookingStatus: booking.bookingStatus || null,
      name: booking.name || booking.customerName || null,
    })),
    extendedHistory: [],
  }
}

function fail(res, status, message) {
  return res.status(status).json({ message })
}

async function withHistory(collection, filter, sort, page, limit) {
  return collection.aggregate([
    { $match: filter },
    { $sort: sort },
    { $skip: (page - 1) * limit },
    { $limit: limit },
    {
      $lookup: {
        from: 'bookings',
        let: { mobile: '$mobile' },
        pipeline: [
          { $match: { $expr: { $eq: ['$mobile', '$$mobile'] } } },
          { $sort: { createdAt: -1, _id: -1 } },
          { $limit: 50 },
          { $project: { _id: 0, date: 1, time: 1, duration: 1, amount: 1, bookingStatus: 1, name: 1, customerName: 1 } },
        ],
        as: 'hourlyHistory',
      },
    },
    {
      $lookup: {
        from: 'extended_enquiries',
        let: { mobile: '$mobile' },
        pipeline: [
          { $match: { $expr: { $eq: ['$mobile', '$$mobile'] } } },
          { $sort: { createdAt: -1, _id: -1 } },
          { $limit: 50 },
          { $project: { _id: 0, name: 1, startDate: 1, endDate: 1, preferredTime: 1, status: 1, requirements: 1, message: 1, summary: 1 } },
        ],
        as: 'extendedHistory',
      },
    },
  ]).toArray()
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return fail(res, 405, 'Method not allowed')

  try {
    const db = await getDb()
    if (!await requireAdmin(req, db)) return fail(res, 401, 'Admin authentication required.')

    const idValue = Array.isArray(req.query?.id) ? req.query.id[0] : req.query?.id
    if (idValue) {
      const id = parseId(String(idValue).trim())
      if (!id) return fail(res, 400, 'Invalid customer id.')
      const customers = await withHistory(db.collection('customers'), { _id: id }, { createdAt: -1, _id: -1 }, 1, 1)
      if (!customers[0]) return fail(res, 404, 'Customer not found.')
      return res.status(200).json({ customer: safeCustomer(customers[0]) })
    }

    const { page, limit } = parsePagination(req.query || {})
    const sort = parseSort(req.query || {})
    const search = safeSearch(req.query?.search || req.query?.mobile)
    const filter = {}
    if (search) {
      filter.$or = [
        { mobile: { $regex: search, $options: 'i' } },
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
      ]
    }

    const collection = db.collection('customers')
    const [total, customers, extendedEnquiries, allBookings] = await Promise.all([
      collection.countDocuments(filter),
      withHistory(collection, filter, sort, page, limit),
      db.collection('extended_enquiries').find({}, { projection: { _id: 0, mobile: 1, name: 1, startDate: 1, endDate: 1, preferredTime: 1, status: 1, requirements: 1, message: 1, summary: 1, createdAt: 1, updatedAt: 1 } }).sort({ createdAt: -1, _id: -1 }).limit(500).toArray(),
      db.collection('bookings').find({}, { projection: { _id: 0, mobile: 1, name: 1, customerName: 1, date: 1, time: 1, duration: 1, amount: 1, bookingStatus: 1, createdAt: 1, updatedAt: 1 } }).sort({ createdAt: -1, _id: -1 }).limit(500).toArray(),
    ])

    const customerMobiles = new Set(customers.map((customer) => String(customer.mobile || '')))
    const extendedOnly = Object.values(extendedEnquiries.reduce((groups, enquiry) => {
      const mobile = String(enquiry.mobile || '').trim()
      if (mobile && !customerMobiles.has(mobile)) (groups[mobile] ||= []).push(enquiry)
      return groups
    }, {})).map(extendedOnlyCustomer)
    const bookingOnly = Object.values(allBookings.reduce((groups, booking) => {
      const mobile = String(booking.mobile || '').trim()
      if (mobile && !customerMobiles.has(mobile) && !extendedOnly.some((customer) => customer.mobile === mobile)) (groups[mobile] ||= []).push(booking)
      return groups
    }, {})).map(hourlyOnlyCustomer)

    return res.status(200).json({
      customers: [...customers, ...extendedOnly, ...bookingOnly].map((customer) => safeCustomer(customer)),
      page,
      limit,
      total: total + extendedOnly.length + bookingOnly.length,
      pages: Math.ceil((total + extendedOnly.length + bookingOnly.length) / limit),
    })
  } catch (error) {
    if (/^Invalid /.test(error.message)) return fail(res, 400, error.message)
    console.error('admin customers failed', error.message)
    return fail(res, 503, 'Customer records are temporarily unavailable.')
  }
}
