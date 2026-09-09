export function parseAdminSessionToken(req) {
  const header = String(req?.headers?.cookie || '')
  if (!header) return ''

  const cookie = header
    .split(';')
    .map((item) => item.trim())
    .find((item) => item.startsWith('turfon24_admin_session='))

  if (!cookie) return ''

  const raw = cookie.slice('turfon24_admin_session='.length)
  try {
    return decodeURIComponent(raw)
  } catch {
    return raw
  }
}
