import * as THREE from 'three'
import type { ChessEngine, Color, PieceType } from './chessEngine'
import type { CharacterAssets } from '../render/characterLoader'
import {
  createPieceEntity,
  removePieceEntity,
  setPieceMove,
  stopPieceMove,
  setPieceRotation,
  type PieceEntity,
} from '../render/pieceEntities'
import {
  getAttackSequence,
  type AttackSequenceStep,
  type PieceName,
} from './attackSequences'
import {
  getPieceAnimationTimeScaleForColor,
  getPieceMoveSpeedForColor,
} from './pieceAttributes'
import { boardToWorld, TILE_HEIGHT } from '../render/board'

type MoveOptions = {
  captureTarget?: PieceEntity
}

type MoveStep = {
  at: number
  clip: string
  speed?: number
  stopAtClipEnd: boolean
  loop: boolean
}

const piecesById = new Map<string, PieceEntity>()
const piecesBySquare = new Map<string, PieceEntity>()

function squareFromCoords(file: number, rank: number) {
  const fileChar = String.fromCharCode(97 + file)
  return `${fileChar}${rank + 1}`
}

function coordsFromSquare(square: string) {
  const file = square.charCodeAt(0) - 97
  const rank = parseInt(square[1], 10) - 1
  return { file, rank }
}

const FADE_DURATION = 0.15
const ROTATION_SPEED = 6
const DEFAULT_ANIMATION_TIME_SCALE = 1
const baseLoopClips = new Set(['walk', 'idle', 'move'])
const nameToType: Record<PieceName, PieceType> = {
  pawn: 'p',
  rook: 'r',
  knight: 'n',
  bishop: 'b',
  queen: 'q',
  king: 'k',
}
const typeToName: Record<PieceType, PieceName> = {
  p: 'pawn',
  r: 'rook',
  n: 'knight',
  b: 'bishop',
  q: 'queen',
  k: 'king',
}

const slidingAttackers = new Set<PieceType>(['r', 'b', 'q'])

function transitionAction(
  entity: PieceEntity,
  action?: THREE.AnimationAction,
  { loopOnce }: { loopOnce?: boolean } = {}
) {
  if (!action) return 0
  action.reset()
  action.enabled = true
  action.setEffectiveTimeScale(getAnimationTimeScale(entity))
  if (loopOnce) {
    action.setLoop(THREE.LoopOnce, 1)
    action.clampWhenFinished = true
  } else {
    action.setLoop(THREE.LoopRepeat, Infinity)
    action.clampWhenFinished = false
  }
  action.play()
  if (entity.activeAction && entity.activeAction !== action) {
    entity.activeAction.crossFadeTo(action, FADE_DURATION, false)
  } else {
    action.fadeIn(FADE_DURATION)
  }
  entity.activeAction = action
  return action.getClip().duration
}

function resolveAction(
  entity: PieceEntity,
  clipName: string,
  attackerType?: PieceType
) {
  const name = clipName.toLowerCase()
  const namedAction = entity.namedActions?.[name]
  if (namedAction) return namedAction
  if (name === 'attack') return entity.actions.attack
  if (name === 'ready') return entity.actions.ready
  if (name === 'walk') return entity.actions.walk
  if (name === 'move') return entity.actions.walk
  if (name === 'idle') return entity.actions.idle
  if (name === 'hit') {
    return attackerType
      ? entity.actions.hitFrom?.[attackerType] ?? entity.actions.hit
      : entity.actions.hit
  }
  if (name === 'die') {
    return attackerType
      ? entity.actions.dieFrom?.[attackerType] ?? entity.actions.die
      : entity.actions.die
  }
  if (name.startsWith('hit-from-')) {
    const attackerName = name.replace('hit-from-', '') as PieceName
    const type = nameToType[attackerName]
    return type ? entity.actions.hitFrom?.[type] ?? entity.actions.hit : undefined
  }
  if (name.startsWith('die-from-')) {
    const attackerName = name.replace('die-from-', '') as PieceName
    const type = nameToType[attackerName]
    return type ? entity.actions.dieFrom?.[type] ?? entity.actions.die : undefined
  }
  return undefined
}

function shouldLoopOnce(clipName: string) {
  const name = clipName.toLowerCase()
  if (baseLoopClips.has(name)) return false
  if (name.startsWith('walk')) return false
  if (name.startsWith('move')) return false
  if (name.startsWith('idle')) return false
  return true
}

function scheduleSequence(
  steps: AttackSequenceStep[],
  attacker: PieceEntity,
  victim: PieceEntity,
  defaultMoveSpeed?: number | null
) {
  console.log(
    `[anims] Sequence ${typeToName[attacker.type]} -> ${typeToName[victim.type]}`,
    steps
  )
  let victimEndMs = 0
  let sequenceEndMs = 0
  const moveSteps: MoveStep[] = []
  steps.forEach((step) => {
    if (step.move && step.target === 'attacker') {
      const action = resolveAction(attacker, step.clip, attacker.type)
      const durationMs = action ? action.getClip().duration * 1000 : 0
      sequenceEndMs = Math.max(sequenceEndMs, step.at + durationMs)
      moveSteps.push({
        at: step.at,
        clip: step.clip,
        speed: step.speed,
        stopAtClipEnd: true,
        loop: false,
      })
      return
    }
    const targetEntity = step.target === 'attacker' ? attacker : victim
    const action = resolveAction(targetEntity, step.clip, attacker.type)
    if (!action) {
      console.log(
        `[anims] Missing clip "${step.clip}" for ${step.target} (${typeToName[targetEntity.type]})`
      )
      sequenceEndMs = Math.max(sequenceEndMs, step.at)
      if (step.target === 'victim') {
        victimEndMs = Math.max(victimEndMs, step.at)
      }
      return
    }
    const loopOnce = shouldLoopOnce(step.clip)
    setTimeout(() => {
      if (step.target === 'attacker' && !step.move) {
        stopPieceMove(attacker)
      }
      transitionAction(targetEntity, action, { loopOnce })
      if (step.target === 'attacker') {
        targetEntity.state = 'attacking'
      }
    }, step.at)
    const durationMs = action.getClip().duration * 1000
    sequenceEndMs = Math.max(sequenceEndMs, step.at + durationMs)
    if (step.target === 'victim') {
      victimEndMs = Math.max(victimEndMs, step.at + durationMs)
    }
  })
  if (typeof defaultMoveSpeed === 'number') {
    moveSteps.push({
      at: sequenceEndMs,
      clip: 'walk',
      speed: defaultMoveSpeed,
      stopAtClipEnd: false,
      loop: true,
    })
  }
  return { victimEndMs, moveSteps }
}

function stopAllActions(entity: PieceEntity) {
  Object.values(entity.actions).forEach((action) => {
    if (action instanceof THREE.AnimationAction) {
      action.stop()
    }
  })
  const stopMapped = (
    map?: Partial<Record<PieceType, THREE.AnimationAction>>
  ) => {
    if (!map) return
    Object.values(map).forEach((mappedAction) => mappedAction?.stop())
  }
  stopMapped(entity.actions.dieFrom)
  stopMapped(entity.actions.hitFrom)
  entity.activeAction = undefined
}

const moveSpeedEnvMap: Record<PieceType, string> = {
  p: 'VITE_PIECE_MOVE_SPEED_PAWN',
  r: 'VITE_PIECE_MOVE_SPEED_ROOK',
  n: 'VITE_PIECE_MOVE_SPEED_KNIGHT',
  b: 'VITE_PIECE_MOVE_SPEED_BISHOP',
  q: 'VITE_PIECE_MOVE_SPEED_QUEEN',
  k: 'VITE_PIECE_MOVE_SPEED_KING',
}

function getMoveSpeedForColor(type: PieceType, color?: Color) {
  const colorName = color === 'w' ? 'white' : color === 'b' ? 'black' : undefined
  const configSpeed =
    colorName !== undefined ? getPieceMoveSpeedForColor(type, colorName) : null
  if (typeof configSpeed === 'number') return configSpeed
  const key = moveSpeedEnvMap[type]
  const raw = import.meta.env[key]
  const parsed = Number.parseFloat(raw ?? '')
  return Number.isFinite(parsed) ? parsed : 4
}

function getRotationSpeed() {
  return ROTATION_SPEED
}

function getAnimationTimeScale(entity: PieceEntity) {
  const raw = import.meta.env.VITE_ANIMATION_TIME_SCALE
  const parsed = Number.parseFloat(raw ?? '')
  const baseScale = parsed > 0 ? parsed : DEFAULT_ANIMATION_TIME_SCALE
  const colorName = entity.color === 'w' ? 'white' : 'black'
  const configScale = getPieceAnimationTimeScaleForColor(
    entity.type,
    colorName
  )
  if (typeof configScale === 'number' && configScale > 0) {
    return baseScale * configScale
  }
  return baseScale
}

function rotateTowards(
  piece: PieceEntity,
  target: THREE.Vector3,
  keepY = true
) {
  const temp = new THREE.Object3D()
  temp.position.copy(piece.root.position)
  const lookTarget = keepY
    ? new THREE.Vector3(target.x, piece.root.position.y, target.z)
    : target
  temp.lookAt(lookTarget)
  setPieceRotation(piece, temp.quaternion, getRotationSpeed())
}

function finalizeMoveToIdle(
  piece: PieceEntity,
  { resetRotation = true }: { resetRotation?: boolean } = {}
) {
  if (resetRotation) {
    const baseRotationY = piece.root.userData.baseRotationY as
      | number
      | undefined
    if (baseRotationY !== undefined) {
      const baseQuat = new THREE.Quaternion().setFromEuler(
        new THREE.Euler(0, baseRotationY, 0)
      )
      setPieceRotation(piece, baseQuat, getRotationSpeed())
    }
  }
  transitionAction(piece, piece.actions.idle)
  piece.state = 'idle'
}

export function initPieces(
  scene: THREE.Scene,
  engine: ChessEngine,
  assets: CharacterAssets
) {
  piecesById.clear()
  piecesBySquare.clear()

  const board = engine.getBoard()
  for (let boardRank = 0; boardRank < 8; boardRank += 1) {
    for (let file = 0; file < 8; file += 1) {
      const piece = board[boardRank][file]
      if (!piece) continue

      const rank = 7 - boardRank
      const entity = createPieceEntity(
        piece.color as Color,
        piece.type as PieceType,
        file,
        rank,
        assets
      )
      scene.add(entity.root)
      piecesById.set(entity.id, entity)
      piecesBySquare.set(squareFromCoords(file, rank), entity)
    }
  }
}

export function getPieceById(id: string) {
  return piecesById.get(id)
}

export function getPieceAtSquare(square: string) {
  return piecesBySquare.get(square)
}

export function getPieceRoots() {
  return Array.from(piecesById.values()).map((entity) => entity.root)
}

export function movePieceEntity(
  piece: PieceEntity,
  toFile: number,
  toRank: number,
  options: MoveOptions = {}
) {
  const fromSquare = squareFromCoords(piece.boardPos.file, piece.boardPos.rank)
  const toSquare = squareFromCoords(toFile, toRank)
  piecesBySquare.delete(fromSquare)

  if (options.captureTarget) {
    piecesBySquare.delete(toSquare)
  }

  const position = boardToWorld(toFile, toRank)
  const target = new THREE.Vector3(position.x, TILE_HEIGHT, position.z)
  const setPieceBoardPos = (file: number, rank: number) => {
    const square = squareFromCoords(file, rank)
    piece.boardPos = { file, rank }
    piece.root.userData.boardPos = { file, rank }
    piecesBySquare.set(square, piece)
  }
  const applyMove = (clipName?: string | null, speedOverride?: number | null) => {
    rotateTowards(piece, target, true)
    const speed =
      typeof speedOverride === 'number'
        ? speedOverride
        : getMoveSpeedForColor(piece.type, piece.color)
    setPieceMove(piece, target, speed)
    setPieceBoardPos(toFile, toRank)
    piece.state = 'moving'
    const action = clipName
      ? resolveAction(piece, clipName)
      : piece.actions.walk
    if (action) {
      const loopOnce = clipName ? shouldLoopOnce(clipName) : false
      transitionAction(piece, action, { loopOnce })
    }
    piece.onMoveComplete = () => {
      if (piece.state === 'moving') {
        finalizeMoveToIdle(piece)
      }
    }
  }

  if (options.captureTarget) {
    const victim = options.captureTarget
    const startAttackSequence = () => {
      console.log(
        `${typeToName[piece.type]} attacking ${typeToName[victim.type]}`
      )
      piece.state = 'attacking'
      victim.state = 'dying'
      const victimPos = victim.root.position
      rotateTowards(piece, victimPos, true)
      const attackerPos = piece.root.position
      rotateTowards(victim, attackerPos, true)
      if (victim.actions.ready) {
        transitionAction(victim, victim.actions.ready, { loopOnce: true })
      }
      const attackerColor = piece.color === 'w' ? 'white' : 'black'
      const steps = getAttackSequence(piece.type, victim.type, attackerColor)
      const { victimEndMs, moveSteps } = scheduleSequence(
        steps,
        piece,
        victim,
        getMoveSpeedForColor(piece.type, piece.color)
      )
      const removalDelay = Math.max(victimEndMs, 300)
      setTimeout(() => {
        victim.root.parent?.remove(victim.root)
        removePieceEntity(victim)
        piecesById.delete(victim.id)
      }, removalDelay)
      if (moveSteps.length === 0) {
        applyMove()
      } else {
        setPieceBoardPos(toFile, toRank)
        moveSteps.forEach((step) => {
          setTimeout(() => {
            const action = resolveAction(piece, step.clip)
            const loopOnce = !step.loop
            const speed =
              typeof step.speed === 'number'
                ? step.speed
                : getMoveSpeedForColor(piece.type, piece.color)
            if (step.loop) {
              rotateTowards(piece, target, true)
            }
            setPieceMove(piece, target, speed, () => {
              if (piece.state === 'moving') {
                finalizeMoveToIdle(piece)
              }
            })
            piece.state = 'moving'
            if (action) {
              transitionAction(piece, action, { loopOnce })
            }
            const durationMs = action ? action.getClip().duration * 1000 : 0
            const token =
              typeof piece.root.userData.moveToken === 'number'
                ? (piece.root.userData.moveToken as number) + 1
                : 1
            piece.root.userData.moveToken = token
            if (step.stopAtClipEnd) {
              setTimeout(() => {
                if (piece.root.userData.moveToken !== token) return
                if (piece.state !== 'moving') return
                stopPieceMove(piece)
                finalizeMoveToIdle(piece, { resetRotation: false })
              }, durationMs)
            }
          }, step.at)
        })
      }
    }

    const deltaFile = victim.boardPos.file - piece.boardPos.file
    const deltaRank = victim.boardPos.rank - piece.boardPos.rank
    const maxDelta = Math.max(Math.abs(deltaFile), Math.abs(deltaRank))
    const isAligned =
      deltaFile === 0 ||
      deltaRank === 0 ||
      Math.abs(deltaFile) === Math.abs(deltaRank)
    const shouldPreMove =
      slidingAttackers.has(piece.type) &&
      isAligned &&
      maxDelta > 1 &&
      (deltaFile !== 0 || deltaRank !== 0)
    const startPreMove = () => {
      if (!shouldPreMove) {
        startAttackSequence()
        return
      }
      const stepFile = Math.sign(deltaFile)
      const stepRank = Math.sign(deltaRank)
      const preFile = toFile - stepFile
      const preRank = toRank - stepRank
      const prePosition = boardToWorld(preFile, preRank)
      const preTarget = new THREE.Vector3(
        prePosition.x,
        TILE_HEIGHT,
        prePosition.z
      )
      setPieceBoardPos(preFile, preRank)
      piece.state = 'moving'
      rotateTowards(piece, preTarget, true)
      const walkAction = piece.actions.walk
      if (walkAction) {
        transitionAction(piece, walkAction, { loopOnce: false })
      }
      const speed = getMoveSpeedForColor(piece.type, piece.color)
      setPieceMove(piece, preTarget, speed, () => {
        setPieceBoardPos(toFile, toRank)
        startAttackSequence()
      })
    }

    const needsFirstClip =
      slidingAttackers.has(piece.type) &&
      piece.root.userData.firstMoveDone !== true
    if (needsFirstClip) {
      piece.root.userData.firstMoveDone = true
      const firstAction = resolveAction(piece, 'first')
      if (firstAction) {
        const durationMs = transitionAction(piece, firstAction, {
          loopOnce: true,
        })
        setTimeout(() => {
          startPreMove()
        }, durationMs * 1000)
      } else {
        startPreMove()
      }
    } else {
      startPreMove()
    }
  } else {
    applyMove()
  }
}

export function getPieceAtCoords(file: number, rank: number) {
  return getPieceAtSquare(squareFromCoords(file, rank))
}

export function getPieceAtWorld(x: number, z: number) {
  const file = Math.round(x + 3.5)
  const rank = Math.round(z + 3.5)
  if (file < 0 || file > 7 || rank < 0 || rank > 7) return undefined
  return getPieceAtCoords(file, rank)
}

export function getPieceSquare(piece: PieceEntity) {
  return squareFromCoords(piece.boardPos.file, piece.boardPos.rank)
}

export function getCoordsFromSquare(square: string) {
  return coordsFromSquare(square)
}
