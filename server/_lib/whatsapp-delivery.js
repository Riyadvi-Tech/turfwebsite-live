import fs from 'node:fs/promises'
import path from 'node:path'

const imageTypes = new Map([
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
])

async function metaRequest(url, options) {
  let response
  try {
    response = await fetch(url, { ...options, signal: AbortSignal.timeout(15000) })
  } catch (error) {
    throw new Error(`Could not reach Meta WhatsApp Cloud API: ${error.message}`)
  }

  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    const metaError = payload.error || {}
    if (Number(metaError.code) === 131047) {
      throw new Error('The customer-service window is closed. Ask the customer to message your WhatsApp Business number, then retry within 24 hours.')
    }
    const detail = metaError.error_user_msg || metaError.message || `HTTP ${response.status}`
    throw new Error(`Meta WhatsApp API error: ${detail}`)
  }
  return payload
}

export async function sendWhatsAppImage(to, filePath, caption = '') {
  const accessToken = String(process.env.WHATSAPP_ACCESS_TOKEN || '').trim()
  const phoneNumberId = String(process.env.WHATSAPP_PHONE_NUMBER_ID || '').trim()
  const graphVersion = String(process.env.WHATSAPP_GRAPH_API_VERSION || 'v25.0').trim()
  if (!accessToken || !phoneNumberId) {
    throw new Error('Set WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID in the server environment.')
  }
  if (!/^\d+$/.test(phoneNumberId) || !/^v\d+\.\d+$/.test(graphVersion)) {
    throw new Error('WHATSAPP_PHONE_NUMBER_ID or WHATSAPP_GRAPH_API_VERSION is invalid.')
  }

  const mobile = String(to || '').replace(/\D/g, '')
  if (!/^\d{11,15}$/.test(mobile)) throw new Error('A valid WhatsApp phone number is required.')
  if (caption.length > 1024) throw new Error('WhatsApp image caption cannot exceed 1024 characters.')

  const resolvedPath = path.resolve(filePath)
  const mimeType = imageTypes.get(path.extname(resolvedPath).toLowerCase())
  if (!mimeType) throw new Error(`Unsupported QR image type: ${path.extname(resolvedPath) || '(none)'}.`)
  const imageBuffer = await fs.readFile(resolvedPath)
  if (imageBuffer.length > 5 * 1024 * 1024) throw new Error('WhatsApp image must be 5 MB or smaller.')

  const baseUrl = `https://graph.facebook.com/${graphVersion}/${phoneNumberId}`
  const uploadBody = new FormData()
  uploadBody.set('messaging_product', 'whatsapp')
  uploadBody.set('type', mimeType)
  uploadBody.set('file', new Blob([imageBuffer], { type: mimeType }), path.basename(resolvedPath))
  const media = await metaRequest(`${baseUrl}/media`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
    body: uploadBody,
  })
  if (!media.id) throw new Error('Meta accepted the image upload but did not return a media ID.')

  return metaRequest(`${baseUrl}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: mobile,
      type: 'image',
      image: { id: media.id, caption },
    }),
  })
}