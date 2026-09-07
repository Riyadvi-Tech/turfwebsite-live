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
  const routeHandler = handlers[route]

  if (!routeHandler) {
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

  return routeHandler(req, res)
}