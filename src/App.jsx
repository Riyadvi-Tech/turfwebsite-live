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
      style.textContent = '.vlogo .admin-brand-wrap{display:flex;align-items:center;justify-content:flex-start;width:100%}.vlogo .admin-brand-logo{width:72px;height:auto;display:block;flex-shrink:0}.vlogo .admin-tagline-logo{max-width:240px;width:100%;height:auto;display:block;filter:drop-shadow(0 0 12px rgba(57,255,122,0.2))}.side-head .admin-brand-wrap{display:flex;align-items:center;justify-content:center;width:100%;overflow:hidden}.side-head .admin-brand-logo{width:58px;height:auto;display:block;flex-shrink:0}.side-head .admin-tagline-logo{max-width:176px;width:100%;height:auto;display:block;margin:0 auto;object-fit:contain;filter:drop-shadow(0 0 10px rgba(57,255,122,0.18))}.sidebar.collapsed .side-head .admin-brand-wrap{gap:0}.sidebar.collapsed .side-head .admin-tagline-logo{display:none}.login-card .login-brand-logo{width:58px;height:auto;display:block;flex-shrink:0}.login-card .login-brand-wrap{display:flex;align-items:center;justify-content:center;width:100%;margin-bottom:20px}.login-card .login-brand-wrap img{max-width:220px;width:100%;height:auto;display:block;margin:0 auto}.login-card .login-tagline-logo{max-width:220px;width:100%;height:auto;display:block;margin:0 auto}.side-foot .admin-profile{display:flex;align-items:center;gap:10px;width:100%;padding:6px 10px;border:1px solid rgba(57,255,122,0.18);border-radius:28px;background:rgba(255,255,255,0.025);box-sizing:border-box}.side-foot .admin-profile-avatar-wrap{width:34px;height:34px;border-radius:50%;overflow:hidden;display:flex;align-items:center;justify-content:center;flex-shrink:0;background:transparent}.side-foot .admin-profile-avatar{width:34px;height:34px;padding:0;border-radius:50%;object-fit:contain;display:block;flex-shrink:0;background:transparent !important}.side-foot .admin-profile-avatar.avatar{background:transparent !important}.side-foot .admin-profile-name,.side-foot .admin-profile-email{font-size:12px;font-weight:600;color:var(--white);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.sidebar.collapsed .side-foot{padding:14px 0;justify-content:center;display:flex;align-items:center}.sidebar.collapsed .side-foot .admin-profile{width:38px;height:38px;min-width:38px;max-width:38px;min-height:38px;max-height:38px;padding:0 !important;border-radius:50% !important;display:flex !important;justify-content:center !important;align-items:center !important;margin:0 auto !important;box-sizing:border-box !important;gap:0 !important;overflow:hidden !important;border:1px solid rgba(57,255,122,0.25) !important;background:rgba(255,255,255,0.025) !important}.sidebar.collapsed .side-foot .admin-profile-avatar-wrap{width:100% !important;height:100% !important;min-width:100% !important;max-width:100% !important;min-height:100% !important;max-height:100% !important;border-radius:50% !important;overflow:hidden !important;display:flex !important;align-items:center !important;justify-content:center !important;margin:0 !important;padding:0 !important;flex-shrink:0 !important;background:transparent !important}.sidebar.collapsed .side-foot .admin-profile-avatar,.sidebar.collapsed .side-foot .avatar{width:100% !important;height:100% !important;min-width:100% !important;min-height:100% !important;max-width:100% !important;max-height:100% !important;border-radius:50% !important;object-fit:cover !important;display:block !important;margin:0 !important;padding:0 !important;transform:none !important}.sidebar.collapsed .side-foot .admin-profile-name,.sidebar.collapsed .side-foot .admin-profile-email{display:none !important}@media (max-width:1000px){.side-head .admin-tagline-logo{max-width:170px;width:auto;height:auto}.vlogo .admin-tagline-logo,.login-card .login-tagline-logo,.login-card .login-brand-wrap img{max-width:220px;width:auto;height:auto}.login-card .login-brand-wrap{margin-top:-6px;margin-bottom:12px}.toolbar{display:flex !important;flex-wrap:wrap !important;align-items:center !important;gap:8px 6px !important;margin-bottom:14px !important}.toolbar input[type="text"]{order:1 !important;width:auto !important;min-width:100px !important;max-width:145px !important;flex:0 1 145px !important;height:32px !important;min-height:32px !important;max-height:32px !important;padding:4px 8px 4px 28px !important;font-size:11px !important;border-radius:8px !important;box-sizing:border-box !important;text-overflow:ellipsis !important;background-image:url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'14\' height=\'14\' viewBox=\'0 0 24 24\' fill=\'none\' stroke=\'%238F9E97\' stroke-width=\'2\' stroke-linecap=\'round\' stroke-linejoin=\'round\'%3E%3Ccircle cx=\'11\' cy=\'11\' r=\'8\'/%3E%3Cpath d=\'m21 21-4.35-4.35\'/%3E%3C/svg%3E") !important;background-repeat:no-repeat !important;background-position:8px center !important;background-size:13px 13px !important}.toolbar input[type="text"]:focus{outline:none !important;border-color:var(--neon) !important;background-image:url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'14\' height=\'14\' viewBox=\'0 0 24 24\' fill=\'none\' stroke=\'%2339ff7a\' stroke-width=\'2\' stroke-linecap=\'round\' stroke-linejoin=\'round\'%3E%3Ccircle cx=\'11\' cy=\'11\' r=\'8\'/%3E%3Cpath d=\'m21 21-4.35-4.35\'/%3E%3C/svg%3E") !important}#page-enquiries #enquirySearch{width:auto !important;min-width:100px !important;max-width:145px !important;flex:0 1 145px !important}.toolbar .toolbar-export-btn{order:2 !important;width:auto !important;min-width:74px !important;max-width:84px !important;height:32px !important;min-height:32px !important;max-height:32px !important;padding:0 10px !important;font-size:11px !important;font-weight:600 !important;display:inline-flex !important;align-items:center !important;justify-content:center !important;text-align:center !important;box-sizing:border-box !important;border-radius:100px !important;white-space:nowrap !important;flex:0 0 auto !important;gap:4px !important;margin:0 !important}.toolbar-actions{order:3 !important;width:100% !important;flex:1 0 100% !important;display:inline-flex !important;align-items:center !important;gap:5px !important;flex-wrap:nowrap !important;overflow-x:auto !important;scrollbar-width:none !important;margin-top:0 !important}}'
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

      const footer = pageDocument.querySelector('.side-foot')
      const profileBadge = footer?.querySelector('.admin-profile')
      const profilePicture = localStorage.getItem('turfon24-admin-profile-picture') || '/logo-assets/LogoWater.png'
      const savedAdminName = localStorage.getItem('turfon24-admin-name') || pageDocument.getElementById('adminSidebarName')?.textContent?.trim() || pageDocument.getElementById('profileName')?.value?.trim() || 'Admin'

      if (footer && !profileBadge) {
        footer.innerHTML = `<div class="admin-profile"><div class="admin-profile-avatar-wrap"><img class="admin-profile-avatar avatar" src="${profilePicture}" alt="TurfOn24" /></div><span class="admin-profile-name" id="adminSidebarName">${savedAdminName}</span></div>`
      } else if (profileBadge) {
        if (!profileBadge.querySelector('.admin-profile-avatar-wrap')) {
          const imgEl = profileBadge.querySelector('.admin-profile-avatar')
          if (imgEl) {
            const wrap = pageDocument.createElement('div')
            wrap.className = 'admin-profile-avatar-wrap'
            imgEl.parentNode.insertBefore(wrap, imgEl)
            wrap.appendChild(imgEl)
          }
        }
        const nameEl = profileBadge.querySelector('.admin-profile-name, .admin-profile-email, #adminSidebarName')
        if (nameEl) nameEl.textContent = savedAdminName
        const imgEl = profileBadge.querySelector('.admin-profile-avatar')
        if (imgEl && profilePicture) imgEl.src = profilePicture
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
