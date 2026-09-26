/**
 * Persistent WhatsApp Web session using WPPConnect.
 */
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'

const require = createRequire(import.meta.url)
const sessionDirectory = path.resolve(process.env.WHATSAPP_SESSION_DIR || path.join(os.homedir(), '.wppconnect-session'))
const qrPath = path.join(sessionDirectory, 'wa-qr.png')

if (!globalThis.__waState) {
  globalThis.__waState = { client: null, ready: false, initPromise: null }
}

const state = globalThis.__waState

function init() {
  if (state.initPromise) return state.initPromise

  state.initPromise = new Promise((resolve) => {
    try {
      const wppconnect = require('@wppconnect-team/wppconnect')
      const qrcode = require('qrcode')

      wppconnect.create({
        session: 'turfon24-admin-bot',
        folderNameToken: sessionDirectory,
        catchQR: (base64Qr, asciiQR, attempts, urlCode) => {
          console.log(asciiQR)
          qrcode.toFile(qrPath, urlCode, { scale: 8 }, (error) => {
            if (error) {
              console.error('[WhatsApp] Failed to save QR code:', error.message)
              return
            }
            console.log(`[WhatsApp] Scan the QR code at: ${qrPath}`)
          })
        },
        logQR: false,
        headless: true,
        autoClose: 0,
        puppeteerOptions: {
          args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--disable-gpu',
          ],
        },
      })
        .then((client) => {
          state.client = client
          state.ready = true
          client.onStateChange?.((connectionState) => {
            state.ready = connectionState === 'CONNECTED'
            if (!state.ready) console.warn(`[WhatsApp] Client state: ${connectionState}`)
          })
          console.log('[WhatsApp] WPPConnect client is ready.')
          resolve(client)
        })
        .catch((error) => {
          console.error('[WhatsApp] WPPConnect initialization failed:', error.message)
          state.initPromise = null
          resolve(null)
        })
    } catch (error) {
      console.error('[WhatsApp] WPPConnect is unavailable:', error.message)
      state.initPromise = null
      resolve(null)
    }
  })

  return state.initPromise
}

function chatIdFor(value) {
  let digits = String(value || '').replace(/\D/g, '')
  if (digits.length === 10) digits = `91${digits}`
  if (!/^\d{10,15}$/.test(digits)) throw new Error('A valid WhatsApp number is required.')
  return `${digits}@c.us`
}

export async function sendImage(to, filePath, caption = '') {
  const client = await init()
  if (!client || !state.ready) throw new Error('WhatsApp client is not ready. Scan the QR code first.')
  await client.sendImage(chatIdFor(to), filePath, path.basename(filePath), caption)
}

export async function sendText(to, text) {
  const client = await init()
  if (!client || !state.ready) throw new Error('WhatsApp client is not ready. Scan the QR code first.')
  await client.sendText(chatIdFor(to), text)
}

export function getQrPath() {
  return qrPath
}

export function getSessionDirectory() {
  return sessionDirectory
}

init()
