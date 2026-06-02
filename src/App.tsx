import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'

type DetectorReaction = {
  intensity: number
  needle: number
  lamp: 'green' | 'amber' | 'red'
  pulse: number
  jitter: number
  glow: number
  clickRate: number
}

type BrowserEnvironment = {
  timestamp: string
  timezone: string
  hour: number
  viewport: {
    width: number
    height: number
    ratio: number
  }
  screen: {
    width: number
    height: number
  }
  touch: boolean
  online: boolean
  connection: string
  battery?: {
    level: number
    charging: boolean
  }
}

const DEFAULT_REACTION: DetectorReaction = {
  intensity: 0.35,
  needle: 34,
  lamp: 'green',
  pulse: 0.42,
  jitter: 0.18,
  glow: 0.35,
  clickRate: 0.2,
}

const NEEDLE_MIN_DEGREES = -150
const NEEDLE_SWEEP_DEGREES = 95

export function App() {
  const [reaction, setReaction] = useState<DetectorReaction>(DEFAULT_REACTION)
  const [armed, setArmed] = useState(false)
  const audioContext = useRef<AudioContext | null>(null)
  const clickTimer = useRef<number | null>(null)

  const styleVars = useMemo(
    () =>
      ({
        '--needle-angle': `${NEEDLE_MIN_DEGREES + (reaction.needle / 100) * NEEDLE_SWEEP_DEGREES}deg`,
        '--lamp-color': lampColor(reaction.lamp),
        '--lamp-glow': String(0.25 + reaction.glow * 0.9),
        '--pulse-speed': `${Math.max(0.7, 3.4 - reaction.pulse * 2.4)}s`,
        '--shake': `${reaction.jitter * 1.7}px`,
        '--readout-opacity': String(0.38 + reaction.intensity * 0.58),
      }) as CSSProperties,
    [reaction],
  )

  const ensureAudio = useCallback(() => {
    const AudioCtor = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AudioCtor) return null
    if (!audioContext.current) {
      audioContext.current = new AudioCtor()
    }
    if (audioContext.current.state === 'suspended') {
      void audioContext.current.resume()
    }
    return audioContext.current
  }, [])

  const playClick = useCallback(() => {
    const ctx = ensureAudio()
    if (!ctx) return

    const oscillator = ctx.createOscillator()
    const gainNode = ctx.createGain()
    oscillator.type = 'square'
    oscillator.frequency.setValueAtTime(640 + reaction.intensity * 740 + Math.random() * 120, ctx.currentTime)
    gainNode.gain.setValueAtTime(0.0001, ctx.currentTime)
    gainNode.gain.exponentialRampToValueAtTime(0.12, ctx.currentTime + 0.002)
    gainNode.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.024)
    oscillator.connect(gainNode)
    gainNode.connect(ctx.destination)
    oscillator.start()
    oscillator.stop(ctx.currentTime + 0.028)
  }, [ensureAudio, reaction.intensity])

  useEffect(() => {
    let cancelled = false

    const askAi = async () => {
      const environment = await collectEnvironment()

      try {
        const response = await fetch('/api/react', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ environment }),
        })
        const data = (await response.json()) as { reaction?: DetectorReaction }
        if (!cancelled && data.reaction) {
          setReaction(normalizeReaction(data.reaction))
        }
      } catch {
        if (!cancelled) {
          setReaction(localReaction(environment))
        }
      }
    }

    void askAi()
    const interval = window.setInterval(askAi, 5000)

    return () => {
      cancelled = true
      window.clearInterval(interval)
    }
  }, [])

  useEffect(() => {
    if (!armed) return

    const tick = () => {
      playClick()
      const delay = Math.max(55, 980 - reaction.clickRate * 850 + Math.random() * 120)
      clickTimer.current = window.setTimeout(tick, delay)
    }

    tick()

    return () => {
      if (clickTimer.current) window.clearTimeout(clickTimer.current)
      clickTimer.current = null
    }
  }, [armed, playClick, reaction.clickRate])

  const armDetector = () => {
    setArmed(true)
    ensureAudio()
  }

  return (
    <main className="detector-screen" onPointerDown={armDetector} style={styleVars}>
      <img className="scene-bg" src="/assets/generated/background.png" alt="" />
      <div className="detector-rig" aria-label="AI-reactive nuclear detector">
        <div className="rig-shadow" />
        <img className="part meter" src="/assets/generated/parts/meter.png" alt="" />
        <img className="part readout" src="/assets/generated/parts/readout.png" alt="" />
        <img className="part lamp" src="/assets/generated/parts/lamp.png" alt="" />
        <img className="part needle" src="/assets/generated/parts/needle.png" alt="" />
        <img className="part body" src="/assets/generated/parts/body.png" alt="" />
        <img className="part speaker" src="/assets/generated/parts/speaker.png" alt="" />
        <div className="readout-energy" />
        <div className="lamp-energy" />
      </div>
    </main>
  )
}

async function collectEnvironment(): Promise<BrowserEnvironment> {
  const now = new Date()
  const nav = navigator as Navigator & {
    connection?: { effectiveType?: string; downlink?: number; rtt?: number }
    getBattery?: () => Promise<{ level: number; charging: boolean }>
  }

  const environment: BrowserEnvironment = {
    timestamp: now.toISOString(),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    hour: now.getHours(),
    viewport: {
      width: window.innerWidth,
      height: window.innerHeight,
      ratio: Number(window.devicePixelRatio.toFixed(2)),
    },
    screen: {
      width: window.screen.width,
      height: window.screen.height,
    },
    touch: navigator.maxTouchPoints > 0,
    online: navigator.onLine,
    connection: nav.connection
      ? `${nav.connection.effectiveType ?? 'unknown'}:${nav.connection.downlink ?? 'na'}:${nav.connection.rtt ?? 'na'}`
      : 'unknown',
  }

  if (nav.getBattery) {
    try {
      const battery = await nav.getBattery()
      environment.battery = {
        level: Number(battery.level.toFixed(2)),
        charging: battery.charging,
      }
    } catch {
      return environment
    }
  }

  return environment
}

function normalizeReaction(value: DetectorReaction): DetectorReaction {
  return {
    intensity: clamp(value.intensity, 0, 1),
    needle: clamp(value.needle, 0, 100),
    lamp: value.lamp === 'red' || value.lamp === 'amber' || value.lamp === 'green' ? value.lamp : 'green',
    pulse: clamp(value.pulse, 0, 1),
    jitter: clamp(value.jitter, 0, 1),
    glow: clamp(value.glow, 0, 1),
    clickRate: clamp(value.clickRate, 0, 1),
  }
}

function localReaction(environment: BrowserEnvironment): DetectorReaction {
  const night = environment.hour < 6 || environment.hour > 20 ? 0.22 : 0
  const network = environment.online ? 0.08 : 0.28
  const compact = environment.viewport.width < 520 ? 0.12 : 0
  const battery = environment.battery && environment.battery.level < 0.3 ? 0.18 : 0
  const intensity = clamp(0.28 + night + network + compact + battery, 0, 1)

  return normalizeReaction({
    intensity,
    needle: intensity * 100,
    lamp: intensity > 0.72 ? 'red' : intensity > 0.48 ? 'amber' : 'green',
    pulse: intensity,
    jitter: intensity * 0.7,
    glow: intensity,
    clickRate: intensity,
  })
}

function lampColor(lamp: DetectorReaction['lamp']): string {
  if (lamp === 'red') return '255,54,32'
  if (lamp === 'amber') return '255,173,45'
  return '139,224,75'
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min))
}
