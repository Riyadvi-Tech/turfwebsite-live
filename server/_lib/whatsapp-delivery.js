export async function sendWhatsAppImage(to, filePath, caption = '') {
  const serviceUrl = String(process.env.WHATSAPP_SERVICE_URL || '').trim()
  const serviceToken = String(process.env.WHATSAPP_SERVICE_TOKEN || '')

  if (serviceUrl) {
    if (!serviceToken) throw new Error('WHATSAPP_SERVICE_TOKEN is not configured.')

    let endpoint
    try {
      endpoint = new URL('/send-image', serviceUrl)
    } catch {
      throw new Error('WHATSAPP_SERVICE_URL must be a valid absolute URL.')
    }
    if (endpoint.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(endpoint.hostname)) {
      throw new Error('WHATSAPP_SERVICE_URL must use HTTPS.')
    }

    let response
    try {
      response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${serviceToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ to, caption }),
        signal: AbortSignal.timeout(30000),
      })
    } catch (error) {
      throw new Error(`Could not reach the WhatsApp sender service: ${error.message}`)
    }

    const result = await response.json().catch(() => ({}))
    if (!response.ok) {
      throw new Error(result.message || `WhatsApp sender returned HTTP ${response.status}.`)
    }
    return result
  }

  if (process.env.VERCEL === '1') {
    throw new Error('WhatsApp sender is not configured. Set WHATSAPP_SERVICE_URL and WHATSAPP_SERVICE_TOKEN for this Vercel environment.')
  }

  const { sendImage } = await import('./whatsapp-client.js')
  return sendImage(to, filePath, caption)
}