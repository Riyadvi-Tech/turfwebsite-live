import { getDb } from '../_lib/mongodb.js'

const REFERENCE_PATTERN = /^T24-\d{8}-[A-F0-9]{8}(?:[A-F0-9]{24})?$/i
const IMAGE_PATTERN = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/
const MAX_SCREENSHOT_LENGTH = 2_500_000

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ message: 'Method not allowed' })

  const reference = String(req.body?.reference || '').trim()
  const utrId = String(req.body?.utrId || '').trim().replace(/\s+/g, '')
  const screenshot = String(req.body?.screenshot || '').trim()
  if (!REFERENCE_PATTERN.test(reference)) return res.status(400).json({ message: 'Invalid payment reference.' })
  if (!/^[A-Za-z0-9-]{6,32}$/.test(utrId)) return res.status(400).json({ message: 'Enter a valid UTR or transaction ID.' })
  if (!IMAGE_PATTERN.test(screenshot) || screenshot.length > MAX_SCREENSHOT_LENGTH) {
    return res.status(400).json({ message: 'Upload a JPG, PNG, or WebP payment screenshot under 2 MB.' })
  }

  try {
    const db = await getDb()
    const now = new Date()
    const result = await db.collection('payment_sessions').updateOne(
      { reference, status: 'PAYMENT_PENDING', expiresAt: { $gt: now } },
      {
        $set: {
          paymentProof: { utrId, screenshot, status: 'PENDING', submittedAt: now, updatedAt: now },
          updatedAt: now,
        },
      },
    )
    if (!result.matchedCount) return res.status(409).json({ message: 'This payment session is no longer available for verification.' })
    return res.status(200).json({ success: true, status: 'PENDING' })
  } catch (error) {
    console.error('payment proof submission failed', error.message)
    return res.status(503).json({ message: 'Unable to submit payment proof right now.' })
  }
}
