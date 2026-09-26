import { timingSafeEqual } from 'node:crypto'
import fs from 'node:fs'
import { createServer } from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url))
const imagePath = path.resolve(scriptDirectory, '../public/logo-assets/qrcodepng.png')
const token = String(process.env.WHATSAPP_SERVICE_TOKEN || '')
const tokenBuffer = Buffer.from(token)
const port = Number(process.env.PORT || process.env.WHATSAPP_SERVICE_PORT || 8787)

if (tokenBuffer.length < 32) {
  throw new Error('Set WHATSAPP_SERVICE_TOKEN to a random secret of at least 32 characters.')
}
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('PORT or WHATSAPP_SERVICE_PORT must be a valid TCP port.')
}
if (!fs.existsSync(imagePath)) {
  throw new Error(`WhatsApp QR image was not found: ${imagePath}`)
}

const { sendImage } = await import('../server/_lib/whatsapp-client.js')

function sendJson(res, status, body) {
  res.writeHead(status, {
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json; charset=utf-8',
  })
  res.end(JSON.stringify(body))
}

function hasValidToken(header) {
  const match = /^Bearer\s+(.+)$/i.exec(String(header || ''))
  if (!match) return false
  const received = Buffer.from(match[1])
  return received.length === tokenBuffer.length && timingSafeEqual(received, tokenBuffer)
}

async function readJson(req) {
  let body = ''
  for await (const chunk of req) {
    body += chunk
    if (Buffer.byteLength(body) > 16384) {
      const error = new Error('Request body is too large.')
      error.status = 413
      throw error
    }
  }
  try {
    return JSON.parse(body || '{}')
  } catch {
    const error = new Error('Invalid JSON body.')
    error.status = 400
    throw error
  }
}

const server = createServer(async (req, res) => {
  const pathname = new URL(req.url || '/', 'http://localhost').pathname
  if (pathname !== '/send-image') return sendJson(res, 404, { success: false, message: 'Not found.' })
  if (req.method !== 'POST') return sendJson(res, 405, { success: false, message: 'Method not allowed.' })
  if (!hasValidToken(req.headers.authorization)) return sendJson(res, 401, { success: false, message: 'Unauthorized.' })

  try {
    const body = await readJson(req)
    const mobile = String(body.to || '').replace(/\D/g, '')
    const caption = String(body.caption || '')
    if (!/^\d{10,15}$/.test(mobile)) return sendJson(res, 400, { success: false, message: 'A valid WhatsApp number is required.' })
    if (caption.length > 6000) return sendJson(res, 400, { success: false, message: 'Message caption is too long.' })

    await sendImage(mobile, imagePath, caption)
    return sendJson(res, 200, { success: true, message: 'QR image sent successfully.' })
  } catch (error) {
    console.error('[WhatsApp service] send failed:', error.message)
    return sendJson(res, error.status || 503, { success: false, message: error.message || 'Unable to send the WhatsApp image.' })
  }
})

server.listen(port, '0.0.0.0', () => {
  console.log(`[WhatsApp service] Listening on port ${port}.`)
  console.log(`[WhatsApp service] Session directory: ${process.env.WHATSAPP_SESSION_DIR || 'user home/.wppconnect-session'}`)
})