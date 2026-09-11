import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  for (const name of [
    'MONGODB_URI',
    'MONGODB_DB',
    'APP_URL',
    'MAIL_FROM',
    'RESET_DEST_EMAIL',
    'SMTP_HOST',
    'SMTP_PORT',
    'SMTP_PASS',
    'SMTP_USER',
    'SMTP_PASSWORD',
    'SMTP_SECURE',
    'SMTP_FROM',
    'MSG91_AUTH_KEY',
  ]) {
    if (env[name]) process.env[name] = env[name]
  }

  return {
  server: { host: true, watch: { ignored: ['**/dist/**'] } },
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

      mountJsonApi('/api', './api/index.js')
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
