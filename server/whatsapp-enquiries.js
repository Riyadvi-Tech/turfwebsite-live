import { getDb } from './_lib/mongodb.js'

function fail(res, status, message) {
  return res.status(status).json({ success: false, message })
}

function normalizeMobile(value) {
  const mobile = String(value || '').replace(/\D/g, '')
  if (!/^\d{10,15}$/.test(mobile)) throw new Error('A valid mobile number is required.')
  return mobile
}

function normalizeEmail(value) {
  const email = String(value || '').trim().toLowerCase()
  if (!email || email.length > 200 || !/^\S+@\S+\.\S+$/.test(email)) throw new Error('A valid email address is required.')
  return email
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return fail(res, 405, 'Method not allowed')

  try {
    const name = String(req.body?.name || '').trim()
    const mobile = normalizeMobile(req.body?.mobile || req.body?.phone)
    const email = normalizeEmail(req.body?.email)
    const message = String(req.body?.message || '').trim()
    if (!name || name.length > 120) throw new Error('A valid name is required.')
    if (!message || message.length > 2000) throw new Error('A valid message is required.')

    const now = new Date()
    const result = await (await getDb()).collection('whatsapp_enquiries').insertOne({
      name,
      mobile,
      email,
      message,
      status: 'new',
      createdAt: now,
      updatedAt: now,
    })

    return res.status(201).json({ success: true, enquiryId: String(result.insertedId), status: 'new' })
  } catch (error) {
    if (/^A valid /.test(error.message)) return fail(res, 400, error.message)
    console.error('whatsapp enquiry persistence failed', error.message)
    return fail(res, 503, 'Unable to save the WhatsApp enquiry right now.')
  }
}
