import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import taglineLogo from './assets/Tagline.png'
import Countdown from './components/Countdown.jsx'
import PixelArcLoader from './components/ui/pixel-arc-loader.tsx'
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
    if (path.startsWith('/loader')) return 'loader'
    if (path.startsWith('/countdown')) return 'countdown'
    return 'home'
  }
  const [route, setRoute] = useState(getRoute)
  const pageTitle = 'TurfOn24'
  const adminUrl = `${import.meta.env.BASE_URL}legacy/admin.html`
  const homeUrl = `${import.meta.env.BASE_URL}legacy/index.html`

  useEffect(() => {
    const onPop = () => setRoute(getRoute())
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  useEffect(() => {
    document.title = pageTitle
    const faviconHref = `${import.meta.env.BASE_URL}logo-assets/LogoWater.png?v=logo-water-tab-v3`
    let favicon = document.querySelector('link[data-turfon24-favicon]')
    if (!favicon) {
      favicon = document.createElement('link')
      favicon.dataset.turfon24Favicon = 'true'
      favicon.rel = 'icon'
      favicon.type = 'image/png'
      favicon.sizes = '512x512'
      document.head.appendChild(favicon)
    }
    favicon.href = faviconHref
  }, [pageTitle, route])

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
      style.textContent = '.vlogo .admin-brand-wrap{display:flex;align-items:center;justify-content:flex-start;width:100%}.vlogo .admin-brand-logo{width:72px;height:auto;display:block;flex-shrink:0}.vlogo .admin-tagline-logo{width:190px;height:auto;display:block}.side-head .admin-brand-wrap{display:flex;align-items:center;justify-content:center;width:100%}.side-head .admin-brand-logo{width:58px;height:auto;display:block;flex-shrink:0}.side-head .admin-tagline-logo{width:180px;height:auto;display:block}.sidebar.collapsed .side-head .admin-brand-wrap{gap:0}.sidebar.collapsed .side-head .admin-tagline-logo{display:none}.login-card .login-brand-logo{width:58px;height:auto;display:block;flex-shrink:0}.login-card .login-brand-wrap{display:flex;align-items:center;justify-content:center;width:100%;margin-bottom:20px}.login-card .login-brand-wrap img{max-width:620px;width:100%;height:auto;display:block}.login-card .login-tagline-logo{width:620px;height:auto;display:block}.side-foot .admin-profile{display:flex;align-items:center;gap:10px;width:100%;padding:6px 10px;border:1px solid rgba(57,255,122,0.12);border-radius:28px;background:rgba(255,255,255,0.025)}.side-foot .admin-profile-avatar{width:34px;height:34px;padding:0;border-radius:50%;object-fit:contain;display:block;flex-shrink:0}.side-foot .admin-profile-email{font-size:12px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.sidebar.collapsed .side-foot .admin-profile{justify-content:center;padding:6px}.sidebar.collapsed .side-foot .admin-profile-email{display:none}.@media (max-width:1000px){.login-card .login-brand-wrap{margin-top:-6px;margin-bottom:12px}.login-card .login-brand-wrap img{max-width:214px;width:100%;height:auto}}'
      pageDocument.head.appendChild(style)
      adminBranding.forEach((branding) => {
        if (!branding.querySelector('.admin-brand-wrap')) {
          branding.innerHTML = `
            <div class="admin-brand-wrap">
              <img class="admin-tagline-logo" src="${taglineLogo}" alt="TurfOn24" />
            </div>
          `
        }
      })

      const loginCard = pageDocument.querySelector('.login-card')
      if (loginCard && !loginCard.querySelector('.login-brand-wrap')) {
        const loginWrap = document.createElement('div')
        loginWrap.className = 'login-brand-wrap'
        loginWrap.innerHTML = `
          <img class="login-tagline-logo" src="${taglineLogo}" alt="TurfOn24" />
        `
        const title = loginCard.querySelector('.login-title')
        if (title) {
          loginCard.insertBefore(loginWrap, title)
        } else {
          loginCard.prepend(loginWrap)
        }
      }

      const footerAvatar = pageDocument.querySelector('.side-foot .avatar')
      const footer = pageDocument.querySelector('.side-foot')
      if (footer && footerAvatar && !footer.querySelector('.admin-profile')) {
        const profilePicture = '/logo-assets/LogoWater.png'
        footer.innerHTML = `<div class="admin-profile"><img class="admin-profile-avatar" src="${profilePicture}" alt="TurfOn24" /><div class="admin-profile-email">ask@turfon24.com</div></div>`
      }
    }
  }

  const handlePageLoad = (event) => {
    replaceNavigationLogo(event)
  }

  return (
    <main className={route === 'loader' || route === 'countdown' ? '' : 'legacy-shell'}>
      {route === 'loader' ? (
        <PixelArcLoader />
      ) : route === 'countdown' ? (
        <Countdown />
      ) : route === 'admin' ? (
        <iframe
          key={adminUrl}
          className="legacy-page"
          src={adminUrl}
          title={pageTitle}
          onLoad={handlePageLoad}
        />
      ) : (
        <iframe
          key={homeUrl}
          className="legacy-page"
          src={homeUrl}
          title={pageTitle}
          onLoad={handlePageLoad}
        />
      )}
    </main>
  )
}

export default App
