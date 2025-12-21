import type { PieceType } from './chessEngine'

export type PieceName =
  | 'pawn'
  | 'rook'
  | 'knight'
  | 'bishop'
  | 'queen'
  | 'king'

export type AttackSequenceStep = {
  target: 'attacker' | 'victim'
  clip: string
  at: number
  move?: boolean
  speed?: number
}

export type AttackSequencesConfig = {
  version: number
  defaults?: {
    attack: AttackSequenceStep[]
  }
  overrides?: Partial<Record<PieceName, Partial<Record<PieceName, AttackSequenceStep[]>>>>
}

const typeToName: Record<PieceType, PieceName> = {
  p: 'pawn',
  r: 'rook',
  n: 'knight',
  b: 'bishop',
  q: 'queen',
  k: 'king',
}

let currentConfig: AttackSequencesConfig | null = null

export function setAttackSequences(config: AttackSequencesConfig) {
  currentConfig = config
}

export function getAttackSequence(
  attackerType: PieceType,
  victimType: PieceType
): AttackSequenceStep[] {
  const attacker = typeToName[attackerType]
  const victim = typeToName[victimType]
  const override = currentConfig?.overrides?.[attacker]?.[victim]
  if (override) return override
  const defaults = currentConfig?.defaults?.attack ?? []
  console.log(
    `[anims] Using default attack sequence for ${attacker} -> ${victim}`
  )
  return defaults
}

export async function loadAttackSequences(
  url = '/config/attackSequences.json'
) {
  try {
    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`Failed to load sequences: ${response.status}`)
    }
    const json = (await response.json()) as AttackSequencesConfig
    currentConfig = json
    return json
  } catch (error) {
    console.warn('Attack sequences not loaded, using empty defaults.', error)
    currentConfig = { version: 1, defaults: { attack: [] } }
    return currentConfig
  }
}
