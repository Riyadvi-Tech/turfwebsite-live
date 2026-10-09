import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import bookings from '../server/bookings.js'
import chatbotConversations from '../server/chatbot-conversations.js'
import extendedEnquiries from '../server/extended-enquiries.js'
import settings from '../server/settings.js'
import whatsappEnquiries from '../server/whatsapp-enquiries.js'
import adminBookings from '../server/admin/bookings.js'
import adminChatbotConversations from '../server/admin/chatbot-conversations.js'
import adminCustomers from '../server/admin/customers.js'
import adminDashboard from '../server/admin/dashboard.js'
import adminDiagnose from '../server/admin/diagnose.js'
import adminExtendedEnquiries from '../server/admin/extended-enquiries.js'
import adminForgotPassword from '../server/admin/forgot-password.js'
import adminLogin from '../server/admin/login.js'
import adminLogout from '../server/admin/logout.js'
import adminPaymentSessions from '../server/admin/payment-sessions.js'
import adminProfile from '../server/admin/profile.js'
import adminReports from '../server/admin/reports.js'
import adminResetPassword from '../server/admin/reset-password.js'
import adminSession from '../server/admin/session.js'
import adminSettings from '../server/admin/settings.js'
import adminVerifyResetToken from '../server/admin/verify-reset-token.js'
import adminWhatsappEnquiries from '../server/admin/whatsapp-enquiries.js'
import paymentCreate from '../server/payment/create.js'
import paymentStatus from '../server/payment/status.js'

const handlers = {
  bookings,
  'chatbot-conversations': chatbotConversations,
  'extended-enquiries': extendedEnquiries,
  settings,
  'whatsapp-enquiries': whatsappEnquiries,
  'admin/bookings': adminBookings,
  'admin/chatbot-conversations': adminChatbotConversations,
  'admin/customers': adminCustomers,
  'admin/dashboard': adminDashboard,
  'admin/diagnose': adminDiagnose,
  'admin/extended-enquiries': adminExtendedEnquiries,
  'admin/forgot-password': adminForgotPassword,
  'admin/login': adminLogin,
  'admin/logout': adminLogout,
  'admin/payment-sessions': adminPaymentSessions,
  'admin/profile': adminProfile,
  'admin/reports': adminReports,
  'admin/reset-password': adminResetPassword,
  'admin/session': adminSession,
  'admin/settings': adminSettings,
  'admin/verify-reset-token': adminVerifyResetToken,
  'admin/whatsapp-enquiries': adminWhatsappEnquiries,
  'payment/create': paymentCreate,
  'payment/status': paymentStatus,
}

const routeFiles = {
  bookings: './server/bookings.js',
  'chatbot-conversations': './server/chatbot-conversations.js',
  'extended-enquiries': './server/extended-enquiries.js',
  settings: './server/settings.js',
  'whatsapp-enquiries': './server/whatsapp-enquiries.js',
  'admin/bookings': './server/admin/bookings.js',
  'admin/chatbot-conversations': './server/admin/chatbot-conversations.js',
  'admin/customers': './server/admin/customers.js',
  'admin/dashboard': './server/admin/dashboard.js',
  'admin/diagnose': './server/admin/diagnose.js',
  'admin/extended-enquiries': './server/admin/extended-enquiries.js',
  'admin/forgot-password': './server/admin/forgot-password.js',
  'admin/login': './server/admin/login.js',
  'admin/logout': './server/admin/logout.js',
  'admin/payment-sessions': './server/admin/payment-sessions.js',
  'admin/profile': './server/admin/profile.js',
  'admin/reports': './server/admin/reports.js',
  'admin/reset-password': './server/admin/reset-password.js',
  'admin/session': './server/admin/session.js',
  'admin/settings': './server/admin/settings.js',
  'admin/verify-reset-token': './server/admin/verify-reset-token.js',
  'admin/whatsapp-enquiries': './server/admin/whatsapp-enquiries.js',
  'payment/create': './server/payment/create.js',
  'payment/status': './server/payment/status.js',
}

function getRoute(req) {
  const configuredRoute = req.query?.route
  if (typeof configuredRoute === 'string' && configuredRoute) {
    return configuredRoute.replace(/^\/+|\/+$/g, '')
  }

  const pathname = new URL(req.url || '/', 'http://localhost').pathname
  return pathname.replace(/^\/api\/?/, '').replace(/^\/+|\/+$/g, '')
}

export default async function handler(req, res) {
  const route = getRoute(req)
  let routeHandler = handlers[route]

  if (!routeHandler && !routeFiles[route]) {
    return res.status(404).json({ message: 'Not found' })
  }

  if (typeof req.body === 'string' || Buffer.isBuffer(req.body)) {
    try {
      req.body = JSON.parse(req.body.toString())
    } catch {
      return res.status(400).json({
        success: false,
        message: 'Invalid JSON body.',
      })
    }
  }

  if (process.env.NODE_ENV !== 'production' && routeFiles[route]) {
    try {
      const moduleUrl = pathToFileURL(resolve(process.cwd(), routeFiles[route])).href + '?t=' + Date.now()
      const mod = await import(moduleUrl)
      if (mod.default) routeHandler = mod.default
    } catch (error) {
      console.warn('Dev hot-reload failed for route:', route, error.message)
    }
  }

  return routeHandler(req, res)
}