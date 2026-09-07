import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import taglineLogo from './assets/Tagline.png'
import Countdown from './components/Countdown'
import './App.css'

window.renderPaymentQr = (image, status, uri) => QRCode.toDataURL(uri, { width: 320, margin: 2, errorCorrectionLevel: 'M' }).then((dataUrl) => {
  image.src = dataUrl
  image.style.display = 'block'
  status.style.display = 'none'
})

function App() {
  const getRoute = () => {
    const path = window.location.pathname
    if (path.startsWith('/admin')) return 'admin'
    if (path.startsWith('/countdown')) return 'countdown'
    return 'home'
  }
  const [route, setRoute] = useState(getRoute)
  const pageTitle = route === 'admin' ? 'TurfOn24 Admin' : (route === 'countdown' ? 'TurfOn24 — Coming Soon' : 'TurfOn24')
  const adminUrl = `${import.meta.env.BASE_URL}legacy/admin.html`
  const homeUrl = `${import.meta.env.BASE_URL}legacy/index.html`

  useEffect(() => {
    const onPop = () => setRoute(getRoute())
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  const goHome = () => {
    if (getRoute() !== 'home') {
      window.history.pushState(null, '', '/')
      setRoute('home')
    }
  }

  useEffect(() => {
    document.title = pageTitle
  }, [pageTitle])

  useEffect(() => {
    if (route !== 'admin') return undefined
    const handleProfilePictureUpdate = (event) => {
      if (event.data?.type !== 'turfon24-profile-picture') return
      const avatar = document.querySelector('.legacy-page')?.contentDocument?.querySelector('.admin-profile-avatar')
      if (avatar) avatar.src = event.data.source
    }
    window.addEventListener('message', handleProfilePictureUpdate)
    return () => window.removeEventListener('message', handleProfilePictureUpdate)
  }, [route])

  const replaceNavigationLogo = (event) => {
    const pageDocument = event.currentTarget.contentDocument
    const navigationLogo = pageDocument?.querySelector('#nav .official-logo')
    if (navigationLogo) {
      navigationLogo.src = taglineLogo
    }

    const footerLogo = pageDocument?.querySelector('footer .official-logo')
    if (footerLogo) {
      footerLogo.src = taglineLogo
    }

    const assistantLogo = pageDocument?.querySelector('.comm-fab img')
    const assistantHeaderLogo = pageDocument?.querySelector('.comm-head-avatar img')
    if (assistantLogo) assistantLogo.src = '/logo-assets/LogoWater.png'
    if (assistantHeaderLogo) assistantHeaderLogo.src = '/logo-assets/LogoWater.png'

    if (navigationLogo) return

    const adminBranding = pageDocument?.querySelectorAll('.vlogo, .side-head')
    if (adminBranding?.length) {

      const style = pageDocument.createElement('style')
      style.textContent = '.vlogo .admin-tagline-logo{width:210px;height:auto;display:block}.side-head .admin-tagline-logo{height:52px;width:auto;display:block;margin:0 auto}.sidebar.collapsed .side-head .admin-tagline-logo{display:none}.login-card .login-tagline-logo{width:210px;height:auto;display:block;margin-bottom:28px}.side-foot .admin-profile{display:flex;align-items:center;gap:10px;width:100%;padding:6px 10px;border:1px solid rgba(57,255,122,0.12);border-radius:28px;background:rgba(255,255,255,0.025)}.side-foot .admin-profile-avatar{width:34px;height:34px;padding:0;border-radius:50%;object-fit:contain;display:block;flex-shrink:0}.side-foot .admin-profile-email{font-size:12px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.sidebar.collapsed .side-foot .admin-profile{justify-content:center;padding:6px}.sidebar.collapsed .side-foot .admin-profile-email{display:none}'
      pageDocument.head.appendChild(style)
      adminBranding.forEach((branding) => {
        if (!branding.querySelector('.admin-tagline-logo')) {
          branding.innerHTML = `<img class="admin-tagline-logo" src="${taglineLogo}" alt="TurfOn24" />`
        }
      })

      const loginCard = pageDocument.querySelector('.login-card')
      if (loginCard && !loginCard.querySelector('.login-tagline-logo')) {

        const loginLogo = pageDocument.createElement('img')
        loginLogo.className = 'login-tagline-logo'
        loginLogo.src = taglineLogo
        loginLogo.alt = 'TurfOn24'
        loginCard.prepend(loginLogo)
      }

      const footerAvatar = pageDocument.querySelector('.side-foot .avatar')
      const footer = pageDocument.querySelector('.side-foot')
      if (footer && footerAvatar && !footer.querySelector('.admin-profile')) {
        const profilePicture = '/logo-assets/LogoWater.png'
        footer.innerHTML = `<div class="admin-profile"><img class="admin-profile-avatar" src="${profilePicture}" alt="TurfOn24" /><div class="admin-profile-email">ask@turfon24.com</div></div>`
      }
    }
  }

  return (
    <main className="legacy-shell">
      {route === 'admin' ? (
        <iframe
          key={adminUrl}
          className="legacy-page"
          src={adminUrl}
          title={pageTitle}
          onLoad={replaceNavigationLogo}
        />
      ) : route === 'countdown' ? (
        <Countdown onHome={goHome} />
      ) : (
        <iframe
          key={homeUrl}
          className="legacy-page"
          src={homeUrl}
          title={pageTitle}
          onLoad={replaceNavigationLogo}
        />
      )}
    </main>
  )
}

export default App
