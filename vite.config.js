import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  if (env.MONGODB_URI) process.env.MONGODB_URI = env.MONGODB_URI
  if (env.MONGODB_DB) process.env.MONGODB_DB = env.MONGODB_DB

  return {
  server: { host: true },
  plugins: [react(), {
    name: 'local-admin-api',
    configureServer(server) {
      const mountJsonApi = (path, modulePath) => {
        server.middlewares.use(path, async (req, res, next) => {
          let body = ''
          req.query = Object.fromEntries(new URL(req.url || '/', 'http://localhost').searchParams.entries())
          for await (const chunk of req) body += chunk
          if (body) {
            try {
              req.body = JSON.parse(body)
            } catch {
              res.statusCode = 400
              res.setHeader('Content-Type', 'application/json')
              return res.end(JSON.stringify({ success: false, message: 'Invalid JSON body.' }))
            }
          }
          res.status = (status) => { res.statusCode = status; return res }
          res.json = (payload) => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(payload)) }
          try {
            const { default: handler } = await import(pathToFileURL(resolve(process.cwd(), modulePath)).href)
            await handler(req, res)
          } catch (error) {
            next(error)
          }
        })
      }

      mountJsonApi('/api/whatsapp-enquiries', './api/whatsapp-enquiries.js')
      mountJsonApi('/api/chatbot-conversations', './api/chatbot-conversations.js')
      mountJsonApi('/api/settings', './api/settings.js')
      mountJsonApi('/api/admin/whatsapp-enquiries', './api/admin/whatsapp-enquiries.js')
      mountJsonApi('/api/admin/chatbot-conversations', './api/admin/chatbot-conversations.js')
      mountJsonApi('/api/admin/session', './api/admin/session.js')
      mountJsonApi('/api/admin/login', './api/admin/login.js')
      mountJsonApi('/api/admin/logout', './api/admin/logout.js')
      mountJsonApi('/api/admin/dashboard', './api/admin/dashboard.js')
      mountJsonApi('/api/admin/bookings', './api/admin/bookings.js')
      mountJsonApi('/api/admin/payment-sessions', './api/admin/payment-sessions.js')
      mountJsonApi('/api/admin/settings', './api/admin/settings.js')
      mountJsonApi('/api/admin/extended-enquiries', './api/admin/extended-enquiries.js')
      mountJsonApi('/api/admin/reports', './api/admin/reports.js')
      mountJsonApi('/api/admin/customers', './api/admin/customers.js')
      mountJsonApi('/api/admin/forgot-password', './api/admin/forgot-password.js')
      mountJsonApi('/api/admin/verify-reset-token', './api/admin/verify-reset-token.js')
      mountJsonApi('/api/admin/reset-password', './api/admin/reset-password.js')
      mountJsonApi('/api/admin/profile', './api/admin/profile.js')

      server.middlewares.use('/api/extended-enquiries', async (req, res, next) => {
        let body = ''
        for await (const chunk of req) body += chunk
        if (body) {
          try {
            req.body = JSON.parse(body)
          } catch {
            res.statusCode = 400
            res.setHeader('Content-Type', 'application/json')
            return res.end(JSON.stringify({ success: false, message: 'Invalid JSON body.' }))
          }
        }

        res.status = (status) => {
          res.statusCode = status
          return res
        }
        res.json = (payload) => {
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify(payload))
        }

        try {
          const { default: handler } = await import(pathToFileURL(resolve(process.cwd(), './api/extended-enquiries.js')).href)
          await handler(req, res)
        } catch (error) {
          next(error)
        }
      })
    },
  }],
  base: './',
  build: {
    rollupOptions: {
      input: {
        main: 'index.html',
        admin: 'admin.html',
      },
    },
  },
  }
})
