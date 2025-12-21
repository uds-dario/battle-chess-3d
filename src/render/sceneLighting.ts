import type * as THREE from 'three'

export type SceneLightingConfig = {
  version: number
  rimLight?: {
    enabled?: boolean
    color?: string | number
    intensity?: number
    position?: { x: number; y: number; z: number }
    helper?: boolean
  }
}

let currentConfig: SceneLightingConfig | null = null

function parseColorValue(value: string | number | undefined) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value !== 'string') return null
  const trimmed = value.trim().toLowerCase()
  if (!trimmed) return null
  if (trimmed.startsWith('#')) {
    const parsed = Number.parseInt(trimmed.slice(1), 16)
    return Number.isFinite(parsed) ? parsed : null
  }
  if (trimmed.startsWith('0x')) {
    const parsed = Number.parseInt(trimmed.slice(2), 16)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function clampIntensity(value: number | undefined) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined
  return Math.max(0, value)
}

export function getRimLightConfig() {
  const rim = currentConfig?.rimLight
  const color = parseColorValue(rim?.color) ?? 0x7aa7ff
  const intensity = clampIntensity(rim?.intensity) ?? 0.35
  const position = rim?.position ?? { x: -8, y: 6, z: -10 }
  return {
    enabled: rim?.enabled ?? true,
    color,
    intensity,
    position,
    helper: rim?.helper ?? false,
  }
}

export async function loadSceneLighting(
  url = '/config/sceneLighting.json'
) {
  try {
    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`Failed to load scene lighting: ${response.status}`)
    }
    const json = (await response.json()) as SceneLightingConfig
    currentConfig = json
    return json
  } catch (error) {
    console.warn('Scene lighting not loaded, using defaults.', error)
    currentConfig = { version: 1 }
    return currentConfig
  }
}

export type RimLightParams = ReturnType<typeof getRimLightConfig>
