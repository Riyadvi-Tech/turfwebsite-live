import { useEffect, useState } from 'react'
import './countdown.css'

const TARGET = new Date('2026-09-13T00:00:00').getTime()
const DATE_TEXT = '13 SEPTEMBER 2026'

function getCountdown(target) {
  const diff = target - Date.now()
  const total = Math.max(0, Math.floor(diff / 1000))
  const days = Math.floor(total / 86400)
  const hours = Math.floor((total % 86400) / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = total % 60
  return {
    days: String(days).padStart(2, '0'),
    hours: String(hours).padStart(2, '0'),
    minutes: String(minutes).padStart(2, '0'),
    seconds: String(seconds).padStart(2, '0'),
    done: total === 0,
  }
}

export default function Countdown() {
  const [parts, setParts] = useState(() => getCountdown(TARGET))
  const [dateText, setDateText] = useState('')

  useEffect(() => {
    let position = 0
    let deleting = false
    let hold = 0
    const timer = window.setInterval(() => {
      if (hold > 0) {
        hold -= 1
        return
      }

      if (deleting) {
        position -= 1
        setDateText(DATE_TEXT.slice(0, position))
        if (position === 0) {
          deleting = false
          hold = 3
        }
      } else {
        position += 1
        setDateText(DATE_TEXT.slice(0, position))
        if (position === DATE_TEXT.length) {
          deleting = true
          hold = 10
        }
      }
    }, 110)

    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    const timer = window.setInterval(() => {
      const next = getCountdown(TARGET)
      setParts(next)
      if (next.done) window.clearInterval(timer)
    }, 1000)
    return () => window.clearInterval(timer)
  }, [])

  return (
    <main className="countdown-page">
      <a className="countdown__home" href="/">
        <span className="countdown__home-arrow" aria-hidden="true">&larr;</span>
        Home
      </a>
      <div className="countdown-frame">
        <img className="countdown-poster" src="/logo-assets/BGC.png" alt="TurfOn24 grand opening countdown" />
        <div className="countdown__topbar">
          <img className="countdown__tagline-img" src="/logo-assets/Tagline.png" alt="TurfOn24" />
        </div>
        <section className="countdown__content">
          <div className="countdown__inner">
            <p className="countdown__eyebrow"><span aria-hidden="true">&bull;</span> Opening Soon <span aria-hidden="true">&bull;</span></p>
            <h1 className="countdown__title">We&rsquo;re<br />Opening Soon</h1>
            <p className="countdown__tagline">Your turf. Your time. Your game.</p>
            <p className="countdown__grand-label">Grand Opening</p>
            <p className="countdown__date" aria-label={DATE_TEXT}>{dateText || '\u00A0'}</p>
            <div className="countdown-image-timer" role="timer" aria-label={`${parts.days} days, ${parts.hours} hours, ${parts.minutes} minutes, ${parts.seconds} seconds remaining`}>
              {[['days', parts.days], ['hours', parts.hours], ['minutes', parts.minutes], ['seconds', parts.seconds]].map(([label, value]) => (
                <div className="countdown-image-panel" key={label}>
                  <span className="countdown-image-number">{value}</span>
                  <span className="countdown-image-label">{label}</span>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </main>
  )
}
