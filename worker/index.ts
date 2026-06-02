interface Env {
  ASSETS: Fetcher
  AI_URL?: string
}

type Reaction = {
  intensity: number
  needle: number
  lamp: 'green' | 'amber' | 'red'
  pulse: number
  jitter: number
  glow: number
  clickRate: number
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)

    if (url.pathname === '/api/react') {
      if (request.method !== 'POST') {
        return json({ error: 'Method not allowed' }, 405)
      }

      return reactToEnvironment(request, env)
    }

    return env.ASSETS.fetch(request)
  },
}

async function reactToEnvironment(request: Request, env: Env): Promise<Response> {
  let payload: { environment?: unknown }

  try {
    payload = await request.json()
  } catch {
    return json({ error: 'Invalid JSON', reaction: fallbackReaction() }, 400)
  }

  const body = {
    system:
      'You are the control intelligence inside a fictional fullscreen nuclear detector artwork. Decide only how the visual instrument should react to the current browser/request environment. This is not a real radiation detector. Return compact JSON only.',
    messages: [
      {
        role: 'user',
        content: JSON.stringify(
          {
            browserEnvironment: payload.environment ?? {},
            responseShape: {
              intensity: 'number 0..1, overall detector activity',
              needle: 'number 0..100, analog needle sweep',
              lamp: 'green | amber | red',
              pulse: 'number 0..1, lamp/readout pulse speed',
              jitter: 'number 0..1, physical vibration',
              glow: 'number 0..1, readout and lamp brightness',
              clickRate: 'number 0..1, optional Geiger click density after user taps',
            },
            rule: 'Base the reaction only on the provided coarse browser signals: local time bucket, viewport bucket, touch support, online hint, and connection type. Return only JSON.',
          },
          null,
          2,
        ),
      },
    ],
  }

  try {
    const aiUrl = env.AI_URL

    if (!aiUrl) {
      return json({ reaction: fallbackReaction(), source: 'fallback' })
    }

    const upstream = await fetch(aiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })

    const text = await upstream.text()
    const parsed = parseJson(text)
    const extracted = parseJson(extractText(parsed ?? text)) ?? parsed
    const reaction = normalizeReaction(extracted)

    if (!upstream.ok || !reaction) {
      return json({ reaction: fallbackReaction(), source: 'fallback' }, upstream.ok ? 200 : 502)
    }

    return json({ reaction, source: 'ai' })
  } catch {
    return json({ reaction: fallbackReaction(), source: 'fallback' })
  }
}

function normalizeReaction(value: unknown): Reaction | null {
  if (!value || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  const lamp = record.lamp === 'red' || record.lamp === 'amber' || record.lamp === 'green' ? record.lamp : 'green'

  return {
    intensity: clamp(record.intensity, 0, 1),
    needle: clamp(record.needle, 0, 100),
    lamp,
    pulse: clamp(record.pulse, 0, 1),
    jitter: clamp(record.jitter, 0, 1),
    glow: clamp(record.glow, 0, 1),
    clickRate: clamp(record.clickRate, 0, 1),
  }
}

function fallbackReaction(): Reaction {
  const minute = new Date().getUTCMinutes()
  const intensity = 0.28 + (minute % 10) / 18

  return {
    intensity,
    needle: intensity * 100,
    lamp: intensity > 0.72 ? 'red' : intensity > 0.48 ? 'amber' : 'green',
    pulse: intensity,
    jitter: intensity * 0.7,
    glow: intensity,
    clickRate: intensity,
  }
}

function clamp(value: unknown, min: number, max: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : min
}

function extractText(value: unknown): string {
  if (typeof value === 'string') return value
  if (!value || typeof value !== 'object') return ''

  const record = value as Record<string, unknown>
  const direct = ['answer', 'reply', 'result', 'output', 'text', 'content', 'message']

  for (const key of direct) {
    const current = record[key]
    if (typeof current === 'string') return current
  }

  if (Array.isArray(record.content)) {
    return record.content.map(extractText).filter(Boolean).join(' ')
  }

  if (record.message && typeof record.message === 'object') {
    return extractText(record.message)
  }

  if (Array.isArray(record.choices)) {
    const first = record.choices[0]
    if (first && typeof first === 'object') {
      const choice = first as Record<string, unknown>
      return extractText(choice.message ?? choice.text ?? choice)
    }
  }

  return ''
}

function parseJson(text: unknown): unknown {
  if (typeof text !== 'string') return null

  try {
    return JSON.parse(text)
  } catch {
    const match = text.match(/\{[\s\S]*\}/)
    if (!match) return null

    try {
      return JSON.parse(match[0])
    } catch {
      return null
    }
  }
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
    },
  })
}
