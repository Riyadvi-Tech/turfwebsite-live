import crypto from 'node:crypto'
import { getDb } from './_lib/mongodb.js'

const PREFERRED_TIMES = new Set(['Morning', 'Evening', 'Night'])

function fail(res, status, message) {
  return res.status(status).json({ success: false, message })
}

function invalid(message) {
  const error = new Error(message)
  error.code = 'INVALID_ENQUIRY'
  return error
}

function dateValue(value, fieldName) {
  const input = String(value || '')
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(input)
  if (!match) throw invalid(`Invalid ${fieldName}.`)

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(Date.UTC(year, month - 1, day))
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) throw invalid(`Invalid ${fieldName}.`)
  return date
}

function normalize(value) {
  const start = dateValue(value.startDate, 'start date')
  const end = dateValue(value.endDate, 'end date')
  const now = new Date()
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  if (start.getTime() < today || end.getTime() < start.getTime()) throw invalid('Invalid enquiry date range.')
  if ((end.getTime() - start.getTime()) / 86400000 > 90) throw invalid('Enquiry date range is too long.')

  const mobile = String(value.mobile || '').replace(/\D/g, '')
  if (!/^\d{10,15}$/.test(mobile)) throw invalid('A valid mobile number is required.')

  const name = String(value.name || '').trim()
  if (!name || name.length > 120) throw invalid('A valid name is required.')

  const preferred = Array.isArray(value.preferredTime) ? value.preferredTime : [value.preferredTime]
  const preferredTime = [...new Set(preferred.map((item) => String(item || '').trim()))]
    .filter((item) => PREFERRED_TIMES.has(item))
    .join(', ')
  if (!preferredTime) throw invalid('Select a preferred time.')

  const requirements = String(value.requirements || '').trim()
  if (requirements.length > 2000) throw invalid('Requirements are too long.')

  const startDate = value.startDate
  const endDate = value.endDate
  const fingerprint = crypto.createHash('sha256').update(JSON.stringify({ mobile, name, startDate, endDate, preferredTime, requirements })).digest('hex')
  return {
    mobile,
    name,
    startDate,
    endDate,
    preferredTime,
    requirements,
    summary: `${name} extended booking enquiry for ${startDate} to ${endDate}`,
    fingerprint,
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return fail(res, 405, 'Method not allowed')

  const requestKey = String(req.body?.requestKey || '').trim()
  if (!/^[A-Za-z0-9_-]{16,128}$/.test(requestKey)) return fail(res, 400, 'Invalid enquiry request.')

  let db
  let enquiry
  try {
    enquiry = normalize(req.body || {})
    db = await getDb()
    const collection = db.collection('extended_enquiries')
    await collection.createIndex(
      { requestKey: 1 },
      { unique: true, sparse: true, name: 'request_key_unique' },
    )

    const existing = await collection.findOne({ requestKey })
    if (existing) {
      if (existing.requestFingerprint !== enquiry.fingerprint) return fail(res, 409, 'Enquiry request does not match the existing request.')
      return res.status(200).json({ success: true, enquiryId: String(existing._id), status: existing.status })
    }

    const now = new Date()
    const result = await collection.insertOne({
      mobile: enquiry.mobile,
      name: enquiry.name,
      startDate: enquiry.startDate,
      endDate: enquiry.endDate,
      preferredTime: enquiry.preferredTime,
      requirements: enquiry.requirements,
      summary: enquiry.summary,
      status: 'new',
      requestKey,
      requestFingerprint: enquiry.fingerprint,
      createdAt: now,
      updatedAt: now,
    })

    return res.status(201).json({
      success: true,
      enquiryId: String(result.insertedId),
      status: 'new',
    })
  } catch (error) {
    if (error.code === 11000) {
      const existing = await db?.collection('extended_enquiries').findOne({ requestKey })
      if (existing && existing.requestFingerprint === enquiry?.fingerprint) {
        return res.status(200).json({ success: true, enquiryId: String(existing._id), status: existing.status })
      }
      if (existing) return fail(res, 409, 'Enquiry request does not match the existing request.')
    }
    if (error.code === 'INVALID_ENQUIRY') {
      return fail(res, 400, error.message)
    }
    console.error('extended enquiry persistence failed', error.message)
    return fail(res, 503, 'Unable to submit the enquiry right now.')
  }
}
