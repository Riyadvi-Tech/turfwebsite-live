import crypto from 'node:crypto'
import { ObjectId } from 'mongodb'
import { getDb } from '../_lib/mongodb.js'

const ENQUIRY_STATUSES = new Set(['NEW', 'CONTACTED', 'QUOTATION_SENT', 'CONFIRMED', 'CLOSED'])

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

function enquiryId(req) {
  const queryId = Array.isArray(req.query?.id) ? req.query.id[0] : req.query?.id
  if (queryId) return String(queryId).trim()
  const path = String(req.url || '').split('?')[0].replace(/\/$/, '')
  const match = /\/api\/admin\/extended-enquiries\/([^/]+)$/.exec(path)
  return match ? decodeURIComponent(match[1]) : ''
}

function parseObjectId(value) {
  return ObjectId.isValid(value) ? new ObjectId(value) : null
}

function parseStatus(value) {
  if (value === undefined || value === null || value === '') return null
  const status = String(value).trim().toUpperCase().replaceAll('-', '_').replaceAll(' ', '_')
  if (!ENQUIRY_STATUSES.has(status)) throw new Error('Invalid enquiry status.')
  return status.toLowerCase()
}

function parseDate(value, fieldName) {
  if (value === undefined || value === '') return null
  const date = String(value).trim()
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
  if (!match) throw new Error(`Invalid ${fieldName}.`)
  const parsed = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])))
  if (
    parsed.getUTCFullYear() !== Number(match[1]) ||
    parsed.getUTCMonth() !== Number(match[2]) - 1 ||
    parsed.getUTCDate() !== Number(match[3])
  ) throw new Error(`Invalid ${fieldName}.`)
  return date
}

function pagination(query) {
  const page = Number(query.page || 1)
  const limit = Number(query.limit || 25)
  if (!Number.isInteger(page) || page < 1 || !Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new Error('Invalid pagination.')
  }
  return { page, limit }
}

const projection = {
  name: 1,
  mobile: 1,
  startDate: 1,
  endDate: 1,
  preferredTime: 1,
  requirements: 1,
  summary: 1,
  status: 1,
  createdAt: 1,
  updatedAt: 1,
}

function publicEnquiry(enquiry) {
  return { ...enquiry, _id: String(enquiry._id) }
}

function fail(res, status, message) {
  return res.status(status).json({ message })
}

export default async function handler(req, res) {
  if (!['GET', 'PATCH'].includes(req.method)) return fail(res, 405, 'Method not allowed')

  try {
    const db = await getDb()
    if (!await requireAdmin(req, db)) return fail(res, 401, 'Admin authentication required.')

    const idValue = enquiryId(req)
    if (idValue) {
      const id = parseObjectId(idValue)
      if (!id) return fail(res, 400, 'Invalid enquiry id.')

      if (req.method === 'GET') {
        const enquiry = await db.collection('extended_enquiries').findOne({ _id: id }, { projection })
        return enquiry ? res.status(200).json({ enquiry: publicEnquiry(enquiry) }) : fail(res, 404, 'Enquiry not found.')
      }

      const status = parseStatus(req.body?.status)
      if (!status) return fail(res, 400, 'Enquiry status is required.')
      const result = await db.collection('extended_enquiries').findOneAndUpdate(
        { _id: id },
        { $set: { status, updatedAt: new Date() } },
        { returnDocument: 'after', projection },
      )
      return result ? res.status(200).json({ enquiry: publicEnquiry(result) }) : fail(res, 404, 'Enquiry not found.')
    }

    if (req.method !== 'GET') return fail(res, 400, 'Enquiry id is required.')

    const { page, limit } = pagination(req.query || {})
    const status = parseStatus(req.query?.status)
    const mobile = req.query?.mobile === undefined ? '' : String(req.query.mobile).trim()
    if (mobile && !/^\d{3,15}$/.test(mobile)) throw new Error('Invalid mobile.')
    const startDate = parseDate(req.query?.startDate, 'start date')
    const endDate = parseDate(req.query?.endDate, 'end date')
    const createdDate = parseDate(req.query?.createdDate, 'enquiry date')
    const filter = {}
    if (status) filter.status = status
    if (mobile) filter.mobile = mobile
    if (startDate && endDate) {
      filter.startDate = { $lte: endDate }
      filter.endDate = { $gte: startDate }
    } else if (startDate) {
      filter.endDate = { $gte: startDate }
    } else if (endDate) {
      filter.startDate = { $lte: endDate }
    }
    if (createdDate) {
      const nextDate = new Date(`${createdDate}T00:00:00.000Z`)
      nextDate.setUTCDate(nextDate.getUTCDate() + 1)
      const nextDateKey = nextDate.toISOString().slice(0, 10)
      filter.$or = [
        { createdAt: { $gte: new Date(`${createdDate}T00:00:00.000Z`), $lt: nextDate } },
        { createdAt: { $gte: `${createdDate}T00:00:00.000Z`, $lt: `${nextDateKey}T00:00:00.000Z` } },
      ]
    }

    const collection = db.collection('extended_enquiries')
    const [total, enquiries] = await Promise.all([
      collection.countDocuments(filter),
      collection.find(filter, { projection })
        .sort({ createdAt: -1, _id: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .toArray(),
    ])

    return res.status(200).json({
      enquiries: enquiries.map(publicEnquiry),
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    })
  } catch (error) {
    if (/^Invalid /.test(error.message)) return fail(res, 400, error.message)
    console.error('admin extended enquiries failed', error.message)
    return fail(res, 503, 'Extended enquiries are temporarily unavailable.')
  }
}
