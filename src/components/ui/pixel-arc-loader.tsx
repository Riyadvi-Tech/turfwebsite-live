import { useEffect, useState } from 'react'

const FONT_LINK_ID = 'pixel-arc-loader-fonts'
const FONT_HREF = 'https://fonts.googleapis.com/css2?family=Press+Start+2P&display=block'
const FONT_FAMILY = '"Press Start 2P", ui-monospace, monospace'
const DEPTH = 11
const WAVE_LIFT = -16
const WAVE_DURATION = 1.42
const WAVE_STAGGER = 0.11

export type PixelArcLoaderProps = {
  title?: string
  sceneSrc?: string
  sceneAlt?: string
  preview?: boolean
  className?: string
}

function cn(...parts: Array<string | undefined | false>) {
  return parts.filter(Boolean).join(' ')
}

function usePixelArcFonts() {
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (typeof document === 'undefined') return undefined
    if (!document.getElementById(FONT_LINK_ID)) {
      const link = document.createElement('link')
      link.id = FONT_LINK_ID
      link.rel = 'stylesheet'
      link.href = FONT_HREF
      document.head.appendChild(link)
    }

    let cancelled = false
    const fallback = window.setTimeout(() => {
      if (!cancelled) setReady(true)
    }, 900)

    void (async () => {
      try {
        await document.fonts?.load?.('400 64px "Press Start 2P"')
        await document.fonts?.ready
      } catch {
        // The fallback timer still reveals the loader if the font cannot load.
      }
      if (!cancelled) setReady(true)
    })()

    return () => {
      cancelled = true
      window.clearTimeout(fallback)
    }
  }, [])

  return ready
}

function splitTitleChars(title: string) {
  const chars = Array.from(title)
  const mid = Math.max(chars.length - 1, 1) / 2
  return chars.map((char, index) => ({
    key: `${index}-${char === ' ' ? 'sp' : char}`,
    char: char === ' ' ? '\u00A0' : char,
    index,
    fromCenter: index - mid,
  }))
}

function stillWaveLift(index: number) {
  const dist = Math.abs(index - 2)
  if (dist >= 2.4) return 0
  return WAVE_LIFT * Math.max(0, 1 - dist / 2.15)
}

function PixelLetter({
  char,
  fromCenter,
  index,
  preview,
}: {
  char: string
  fromCenter: number
  index: number
  preview: boolean
}) {
  const rotate = fromCenter * 7.2
  const drop = fromCenter * fromCenter * 4.1

  return (
    <span
      className={cn('pixel-arc-letter', !preview && 'gen-pixel-arc-wave')}
      style={
        preview
          ? { transform: `translateY(${stillWaveLift(index)}px)` }
          : {
              animationDuration: `${WAVE_DURATION}s`,
              animationDelay: `${index * WAVE_STAGGER}s`,
            }
      }
    >
      <span
        className="pixel-arc-letter-inner"
        style={{
          transform: `rotate(${rotate}deg) translateY(${drop}px)`,
          transformOrigin: '50% 85%',
        }}
      >
        {Array.from({ length: DEPTH }, (_, layer) => (
          <span
            key={layer}
            aria-hidden="true"
            className="pixel-arc-depth"
            style={{
              transform: `translate(${layer}px, ${layer}px)`,
              color: layer > DEPTH - 3 ? '#070707' : '#161616',
              zIndex: 0,
            }}
          >
            {char}
          </span>
        ))}
        <span
          className="pixel-arc-face"
          style={{
            textShadow: '-1px -1px 0 #0a0a0a, 1px -1px 0 #0a0a0a, -1px 1px 0 #0a0a0a, 1px 1px 0 #0a0a0a',
            WebkitTextStroke: '0.8px #111111',
            paintOrder: 'stroke fill',
          }}
        >
          {char}
        </span>
      </span>
    </span>
  )
}

export function PixelArcLoader({
  title = 'LOADING',
  sceneSrc = '/logo-assets/Count.png',
  sceneAlt = '',
  preview = false,
  className,
}: PixelArcLoaderProps) {
  const fontReady = usePixelArcFonts()
  const letters = splitTitleChars(title)

  return (
    <div role="status" aria-live="polite" aria-busy="true" className={cn('pixel-arc-loader', className)}>
      <style>{`
        @keyframes gen-pixel-arc-wave {
          0% { transform: translate3d(0, 0, 0); }
          14% { transform: translate3d(0, ${WAVE_LIFT}px, 0); }
          22% { transform: translate3d(0, ${WAVE_LIFT}px, 0); }
          36% { transform: translate3d(0, 0, 0); }
          100% { transform: translate3d(0, 0, 0); }
        }
        .pixel-arc-loader { position: relative; isolation: isolate; min-height: 100dvh; width: 100%; overflow: hidden; background: #12110f; }
        .pixel-arc-loader *, .pixel-arc-loader *::before, .pixel-arc-loader *::after { box-sizing: border-box; }
        .pixel-arc-scene { pointer-events: none; position: absolute; inset: 0; width: 100%; height: 100%; transform: scale(1.1); object-fit: cover; filter: blur(28px) saturate(0.78) brightness(0.62); }
        .pixel-arc-overlay { pointer-events: none; position: absolute; inset: 0; background: radial-gradient(ellipse at 50% 48%, rgba(0,0,0,0.08) 0%, rgba(0,0,0,0.42) 70%, rgba(0,0,0,0.62) 100%); }
        .pixel-arc-content { position: relative; z-index: 1; display: flex; min-height: 100dvh; width: 100%; align-items: center; justify-content: center; padding: 0 16px; }
        .pixel-arc-title { display: flex; align-items: flex-end; justify-content: center; margin: 0; opacity: 0; transition: opacity 200ms; font-family: ${FONT_FAMILY}; font-weight: 400; font-size: clamp(1.95rem, 7.6vw, 5.6rem); letter-spacing: 0.06em; line-height: 1; gap: 0.08em; filter: drop-shadow(0 12px 22px rgba(0,0,0,0.5)); }
        .pixel-arc-title.ready { opacity: 1; }
        .pixel-arc-letter { position: relative; display: inline-block; will-change: transform; }
        .pixel-arc-letter-inner { position: relative; display: inline-block; }
        .pixel-arc-depth { pointer-events: none; position: absolute; left: 0; top: 0; user-select: none; }
        .pixel-arc-face { position: relative; z-index: 1; color: #f6f6f6; }
        .gen-pixel-arc-wave { animation-name: gen-pixel-arc-wave; animation-timing-function: cubic-bezier(0.22, 1, 0.36, 1); animation-iteration-count: infinite; animation-fill-mode: both; }
        .pixel-arc-sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }
        @media (prefers-reduced-motion: reduce) { .gen-pixel-arc-wave { animation: none !important; } }
      `}</style>
      <img src={sceneSrc} alt={sceneAlt} className="pixel-arc-scene" />
      <div aria-hidden="true" className="pixel-arc-overlay" />
      <span className="pixel-arc-sr-only">{title}</span>
      <div className="pixel-arc-content">
        <p aria-hidden="true" className={cn('pixel-arc-title', fontReady && 'ready')}>
          {letters.map((letter) => <PixelLetter key={letter.key} {...letter} preview={preview} />)}
        </p>
      </div>
    </div>
  )
}

export default PixelArcLoader