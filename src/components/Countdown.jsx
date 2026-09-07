import { useEffect, useRef, useState } from 'react'
import './countdown.css'
import taglineLogo from '../assets/Tagline.png'

const TARGET = new Date('2026-09-13T00:00:00').getTime()

function differenceText(target) {
  const diff = target - Date.now()
  const total = Math.max(0, Math.floor(diff / 1000))
  const d = Math.floor(total / 86400)
  const h = Math.floor((total % 86400) / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  return {
    days: String(d).padStart(2, '0'),
    hours: String(h).padStart(2, '0'),
    minutes: String(m).padStart(2, '0'),
    seconds: String(s).padStart(2, '0'),
    done: total === 0,
    fracs: {
      days: (total % 86400) / 86400,
      hours: h / 24,
      minutes: m / 60,
      seconds: s / 60,
    },
  }
}

const RING_R = 45
const RING_C = 2 * Math.PI * RING_R

function Unit({ value, label, frac }) {
  return (
    <div className="countdown__unit">
      <svg className="countdown__ring" viewBox="0 0 100 100" aria-hidden="true">
        <circle className="countdown__ring-base" cx="50" cy="50" r={RING_R} />
        <circle
          className="countdown__ring-progress"
          cx="50"
          cy="50"
          r={RING_R}
          strokeDasharray={`${RING_C} ${RING_C}`}
          strokeDashoffset={RING_C * (1 - Math.min(1, Math.max(0, frac)))}
        />
      </svg>
      <span className="countdown__core">
        <span className="countdown__num" key={value}>{value}</span>
        <span className="countdown__label">{label}</span>
      </span>
    </div>
  )
}

export default function Countdown({ onHome }) {
  const [parts, setParts] = useState(() => differenceText(TARGET))
  const intervalRef = useRef(null)

  useEffect(() => {
    intervalRef.current = window.setInterval(() => {
      setParts(differenceText(TARGET))
    }, 1000)
    return () => window.clearInterval(intervalRef.current)
  }, [])

  return (
    <main className="countdown-page">
      <div className="countdown__bg" aria-hidden="true" />
      <div className="countdown__scrim" aria-hidden="true" />
      <div className="countdown__mist" aria-hidden="true" />
      <div className="countdown__glow" aria-hidden="true" />

      <header className="countdown__topbar">
        {onHome && (
          <button type="button" className="countdown__home" onClick={onHome} aria-label="Go to home">
            <span className="countdown__home-arrow" aria-hidden="true">&larr;</span>
            <span>Home</span>
          </button>
        )}
      </header>

      <div className="countdown__content">
        <div className="countdown__inner">
          <img
            className="countdown__tagline-img"
            src={taglineLogo}
            alt="Your Turf. Your Time. Your Game."
          />

          <p className="countdown__eyebrow">&#8226; Opening Soon</p>

          {parts.done ? (
            <p className="countdown__live" role="status">We&rsquo;re Live</p>
          ) : (
            <>
              <h1 className="countdown__title">
                We&rsquo;re<span aria-hidden="true"><br /></span>Opening Soon
              </h1>

              <p className="countdown__tagline">Your Turf. Your Time. Your Game.</p>

              <p className="countdown__grand-label">Grand Opening</p>
              <p className="countdown__date">13 September 2026</p>

              <p className="countdown__desc">
                The wait is almost over.<br />
                Get ready to play, compete, and make your game count.
              </p>

              <div className="countdown__timer" role="timer" aria-live="off">
                <Unit value={parts.days} label="Days" frac={parts.fracs.days} />
                <Unit value={parts.hours} label="Hours" frac={parts.fracs.hours} />
                <Unit value={parts.minutes} label="Minutes" frac={parts.fracs.minutes} />
                <Unit value={parts.seconds} label="Seconds" frac={parts.fracs.seconds} />
              </div>
            </>
          )}
        </div>
      </div>
    </main>
  )
}
