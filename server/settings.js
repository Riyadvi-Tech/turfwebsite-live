import { getDb } from './_lib/mongodb.js'

function publicSettings(settings = {}) {
  return {
    businessName: settings.businessName || 'Turfon24',
    hourlyRate: Number(settings.hourlyRate || 800),
    phone: settings.phone || '+91 89399 89366',
    whatsapp: settings.whatsapp || '+91 89399 89366',
    email: settings.email || 'ask@turfon24.com',
    upi: settings.upiId || settings.upi || 'turfon24@okaxis',
    address: settings.address || 'Cuddalore',
  }
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ message: 'Method not allowed' })
  try {
    const db = await getDb()
    const settings = await db.collection('website_settings').findOne({ key: 'main' }, { projection: { _id: 0, businessName: 1, hourlyRate: 1, phone: 1, whatsapp: 1, email: 1, upiId: 1, upi: 1, address: 1 } })
    return res.status(200).json({ settings: publicSettings(settings) })
  } catch (error) {
    console.error('public settings failed', error.message)
    return res.status(503).json({ message: 'Website settings are temporarily unavailable.' })
  }
}
