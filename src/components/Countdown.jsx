import { useEffect, useState } from 'react'
import './countdown.css'

const TARGET = new Date('2026-09-13T00:00:00').getTime()

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

export default function Countdown({ onHome }) {
  const [parts, setParts] = useState(() => getCountdown(TARGET))

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
      {onHome && (
        <button type="button" className="countdown-hero-button" onClick={onHome}>
          <span aria-hidden="true">&larr;</span>
          Go to Hero
        </button>
      )}
      <div className="countdown-frame">
        <img className="countdown-poster" src="/logo-assets/count-down.jpeg" alt="TurfOn24 grand opening countdown" />
        <div className="countdown-patch countdown-patch--days" aria-hidden="true" />
        <div className="countdown-patch countdown-patch--hours" aria-hidden="true" />
        <div className="countdown-patch countdown-patch--minutes" aria-hidden="true" />
        <div className="countdown-patch countdown-patch--seconds" aria-hidden="true" />
        <div className="countdown-number countdown-number--days" role="timer" aria-label={`${parts.days} days remaining`}>{parts.days}</div>
        <div className="countdown-number countdown-number--hours" aria-hidden="true">{parts.hours}</div>
        <div className="countdown-number countdown-number--minutes" aria-hidden="true">{parts.minutes}</div>
        <div className="countdown-number countdown-number--seconds" aria-hidden="true">{parts.seconds}</div>
        <div className={`countdown-done${parts.done ? ' countdown-done--visible' : ''}`} role="status">
          WE&rsquo;RE OPEN &mdash; COME PLAY!
        </div>
        <a className="countdown-contact countdown-contact--whatsapp" href="https://wa.me/918939989366" target="_blank" rel="noopener" aria-label="Message us on WhatsApp" />
        <a className="countdown-contact countdown-contact--call" href="tel:+918939989366" aria-label="Call 89399 89366" />
      </div>
    </main>
  )
}
