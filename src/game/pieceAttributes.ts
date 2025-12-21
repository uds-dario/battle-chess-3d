import type { PieceType } from './chessEngine'

export type PieceName =
  | 'pawn'
  | 'rook'
  | 'knight'
  | 'bishop'
  | 'queen'
  | 'king'

export type PieceColorName = 'white' | 'black'

type ColorOverride = Partial<Record<PieceColorName, string | number | null>>
type ScaleOverride =
  | number
  | Partial<Record<PieceColorName, number | null | undefined>>
type ChannelOverride =
  | number
  | Partial<Record<PieceColorName, number | null | undefined>>
type MaterialOverride = Partial<
  Record<
    PieceColorName,
    {
      roughness?: number
      metalness?: number
      emissive?: string | number | null
      emissiveIntensity?: number
    }
  >
>

export type PieceAttributesConfig = {
  version: number
  defaults?: {
    scale?: ScaleOverride
    colors?: ColorOverride
    materials?: MaterialOverride
    roughness?: ChannelOverride
    metalness?: ChannelOverride
  }
  overrides?: Partial<
    Record<
      PieceName,
      {
        scale?: ScaleOverride
        colors?: ColorOverride
        materials?: MaterialOverride
        roughness?: ChannelOverride
        metalness?: ChannelOverride
      }
    >
  >
}

const typeToName: Record<PieceType, PieceName> = {
  p: 'pawn',
  r: 'rook',
  n: 'knight',
  b: 'bishop',
  q: 'queen',
  k: 'king',
}

let currentConfig: PieceAttributesConfig | null = null

export function setPieceAttributes(config: PieceAttributesConfig) {
  currentConfig = config
}

export function getPieceScale(type: PieceType) {
  const pieceName = typeToName[type]
  const overrideScale = currentConfig?.overrides?.[pieceName]?.scale
  const defaultScale = currentConfig?.defaults?.scale
  return resolveScale(overrideScale, defaultScale)
}

function resolveScale(
  overrideScale: ScaleOverride | undefined,
  defaultScale: ScaleOverride | undefined,
  color?: PieceColorName
) {
  const overrideValue = readScaleValue(overrideScale, color)
  if (overrideValue !== null) return overrideValue
  const defaultValue = readScaleValue(defaultScale, color)
  if (defaultValue !== null) return defaultValue
  return 0.8
}

function readScaleValue(
  scale: ScaleOverride | undefined,
  color?: PieceColorName
) {
  if (typeof scale === 'number' && Number.isFinite(scale)) return scale
  if (scale && typeof scale === 'object' && color) {
    const value = scale[color]
    if (typeof value === 'number' && Number.isFinite(value)) return value
  }
  return null
}

function resolveChannel(
  overrideChannel: ChannelOverride | undefined,
  defaultChannel: ChannelOverride | undefined,
  color: PieceColorName
) {
  const overrideValue = readChannelValue(overrideChannel, color)
  if (overrideValue !== null) return overrideValue
  const defaultValue = readChannelValue(defaultChannel, color)
  if (defaultValue !== null) return defaultValue
  return undefined
}

function readChannelValue(
  channel: ChannelOverride | undefined,
  color: PieceColorName
) {
  if (typeof channel === 'number' && Number.isFinite(channel)) return channel
  if (channel && typeof channel === 'object') {
    const value = channel[color]
    if (typeof value === 'number' && Number.isFinite(value)) return value
  }
  return null
}

export function getPieceScaleForColor(type: PieceType, color: PieceColorName) {
  const pieceName = typeToName[type]
  const overrideScale = currentConfig?.overrides?.[pieceName]?.scale
  const defaultScale = currentConfig?.defaults?.scale
  return resolveScale(overrideScale, defaultScale, color)
}

function parseColorValue(value: string | number | null | undefined) {
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

export function getPieceColorOverride(type: PieceType, color: PieceColorName) {
  const pieceName = typeToName[type]
  const override = currentConfig?.overrides?.[pieceName]?.colors?.[color]
  const overrideValue = parseColorValue(override)
  if (overrideValue !== null) return overrideValue
  const defaults = currentConfig?.defaults?.colors?.[color]
  return parseColorValue(defaults)
}

function clampMaterialValue(value: number | undefined) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined
  return Math.min(1, Math.max(0, value))
}

export function getPieceMaterialOverrides(
  type: PieceType,
  color: PieceColorName
) {
  const pieceName = typeToName[type]
  const overrideEntry = currentConfig?.overrides?.[pieceName]
  const defaultEntry = currentConfig?.defaults
  const override = overrideEntry?.materials?.[color]
  const defaults = defaultEntry?.materials?.[color]
  const emissive =
    parseColorValue(override?.emissive) ?? parseColorValue(defaults?.emissive)
  const roughness =
    resolveChannel(overrideEntry?.roughness, defaultEntry?.roughness, color) ??
    clampMaterialValue(override?.roughness ?? defaults?.roughness)
  const metalness =
    resolveChannel(overrideEntry?.metalness, defaultEntry?.metalness, color) ??
    clampMaterialValue(override?.metalness ?? defaults?.metalness)
  return {
    roughness: clampMaterialValue(roughness),
    metalness: clampMaterialValue(metalness),
    emissive,
    emissiveIntensity: clampMaterialValue(
      override?.emissiveIntensity ?? defaults?.emissiveIntensity
    ),
  }
}

export async function loadPieceAttributes(
  url = '/config/pieceAttributes.json'
) {
  try {
    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`Failed to load piece attributes: ${response.status}`)
    }
    const json = (await response.json()) as PieceAttributesConfig
    currentConfig = json
    return json
  } catch (error) {
    console.warn('Piece attributes not loaded, using defaults.', error)
    currentConfig = { version: 1, defaults: { scale: 0.8 } }
    return currentConfig
  }
}
