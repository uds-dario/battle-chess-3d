import * as THREE from 'three'
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js'
import type { Color, PieceType } from '../game/chessEngine'
import type { CharacterAssets } from './characterLoader'
import { boardToWorld, TILE_HEIGHT } from './board'
import {
  getPieceColorOverride,
  getPieceMaterialOverrides,
  getPieceScaleForColor,
} from '../game/pieceAttributes'

export type PieceEntity = {
  id: string
  color: Color
  type: PieceType
  boardPos: { file: number; rank: number }
  root: THREE.Object3D
  mixer: THREE.AnimationMixer
  moveTarget?: THREE.Vector3
  moveSpeed?: number
  rotationTarget?: THREE.Quaternion
  rotationSpeed?: number
  onMoveComplete?: () => void
  activeAction?: THREE.AnimationAction
  actions: {
    idle?: THREE.AnimationAction
    walk?: THREE.AnimationAction
    attack?: THREE.AnimationAction
    ready?: THREE.AnimationAction
    hit?: THREE.AnimationAction
    die?: THREE.AnimationAction
    dieFrom?: Partial<Record<PieceType, THREE.AnimationAction>>
    hitFrom?: Partial<Record<PieceType, THREE.AnimationAction>>
  }
  namedActions?: Record<string, THREE.AnimationAction>
  state: 'idle' | 'moving' | 'attacking' | 'dying' | 'dead'
}

const entities: PieceEntity[] = []
let entityCounter = 0

function cloneTemplate(template: THREE.Object3D) {
  return cloneSkeleton(template)
}

function findClipByName(clips: THREE.AnimationClip[], name: string) {
  const direct = clips.find((clip) =>
    clip.name.toLowerCase().includes(name.toLowerCase())
  )
  return direct ?? null
}

function findBaseClip(clips: THREE.AnimationClip[], base: string) {
  const lowerBase = base.toLowerCase()
  return (
    clips.find((clip) => {
      const name = clip.name.toLowerCase()
      if (name.startsWith(`${lowerBase}-from-`)) return false
      return (
        name === lowerBase ||
        name.startsWith(`${lowerBase}_`) ||
        name.startsWith(`${lowerBase}-`) ||
        name.startsWith(`${lowerBase} `)
      )
    }) ?? null
  )
}

function logMissingClip(type: PieceType, name: string) {
  console.log(`[anims] Missing clip for ${type}: ${name}`)
}

const attackerNameMap: Record<PieceType, string> = {
  p: 'pawn',
  r: 'rook',
  n: 'knight',
  b: 'bishop',
  q: 'queen',
  k: 'king',
}

function ensureUniqueMaterials(root: THREE.Object3D) {
  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return
    if (Array.isArray(child.material)) {
      child.material = child.material.map((material) => material.clone())
    } else if (child.material) {
      child.material = child.material.clone()
    }
    child.castShadow = true
  })
}

function applyColorOverride(
  root: THREE.Object3D,
  type: PieceType,
  color: Color
) {
  const colorName = color === 'w' ? 'white' : 'black'
  const override = getPieceColorOverride(type, colorName)
  const materialOverrides = getPieceMaterialOverrides(type, colorName)
  const hasMaterialOverrides =
    materialOverrides.roughness !== undefined ||
    materialOverrides.metalness !== undefined ||
    materialOverrides.emissive !== null ||
    materialOverrides.emissiveIntensity !== undefined
  if (override === null && !hasMaterialOverrides) return
  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return
    const materials = Array.isArray(child.material)
      ? child.material
      : [child.material]
    materials.forEach((material) => {
      if (!material || !('color' in material)) return
      const standardMaterial = material as THREE.MeshStandardMaterial
      if (override !== null) {
        standardMaterial.color.setHex(override)
      }
      if (materialOverrides.roughness !== undefined) {
        standardMaterial.roughness = materialOverrides.roughness
      }
      if (materialOverrides.metalness !== undefined) {
        standardMaterial.metalness = materialOverrides.metalness
      }
      if (materialOverrides.emissive !== null) {
        standardMaterial.emissive.setHex(materialOverrides.emissive)
      }
      if (materialOverrides.emissiveIntensity !== undefined) {
        standardMaterial.emissiveIntensity = materialOverrides.emissiveIntensity
      }
    })
  })
}

function ensureFallbackMesh(root: THREE.Object3D) {
  let hasMesh = false
  root.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      hasMesh = true
    }
  })
  if (hasMesh) return

  const geometry = new THREE.CylinderGeometry(0.28, 0.32, 0.7, 18)
  const material = new THREE.MeshStandardMaterial({ color: 0x6b6b6b })
  const fallback = new THREE.Mesh(geometry, material)
  fallback.castShadow = true
  root.add(fallback)
}

function applyTypeTransform(
  root: THREE.Object3D,
  type: PieceType,
  color: Color
) {
  const colorName = color === 'w' ? 'white' : 'black'
  root.scale.setScalar(getPieceScaleForColor(type, colorName))
  switch (type) {
    case 'p':
      break
    case 'r':
      break
    case 'n':
      root.rotation.y = Math.PI / 8
      break
    case 'b':
      break
    case 'q':
      break
    case 'k':
      break
    default:
      break
  }
}

export function createPieceEntity(
  color: Color,
  type: PieceType,
  file: number,
  rank: number,
  assets: CharacterAssets
): PieceEntity {
  const colorKey = color === 'w' ? 'white' : 'black'
  const template = assets.templates[colorKey][type]
  const root = cloneTemplate(template)
  ensureFallbackMesh(root)
  ensureUniqueMaterials(root)
  applyColorOverride(root, type, color)
  applyTypeTransform(root, type, color)
  if (color === 'b') {
    root.rotation.y += Math.PI
  }
  root.userData.baseRotationY = root.rotation.y

  const mixer = new THREE.AnimationMixer(root)
  const clips = assets.clips[colorKey][type]
  const idleClip = findBaseClip(clips, 'idle')
  const walkClip = findBaseClip(clips, 'walk')
  const attackClip = findBaseClip(clips, 'attack')
  const readyClip = findBaseClip(clips, 'ready')
  const hitClip = findBaseClip(clips, 'hit')
  const dieClip = findBaseClip(clips, 'die')
  if (!idleClip) logMissingClip(type, 'idle')
  if (!walkClip) logMissingClip(type, 'walk')
  if (!attackClip) logMissingClip(type, 'attack')
  if (!readyClip) logMissingClip(type, 'ready')
  if (!hitClip) logMissingClip(type, 'hit')
  if (!dieClip) logMissingClip(type, 'die')
  const dieFrom: Partial<Record<PieceType, THREE.AnimationAction>> = {}
  const hitFrom: Partial<Record<PieceType, THREE.AnimationAction>> = {}
  ;(Object.keys(attackerNameMap) as PieceType[]).forEach((attacker) => {
    const clip = findClipByName(clips, `die-from-${attackerNameMap[attacker]}`)
    if (clip) {
      dieFrom[attacker] = mixer.clipAction(clip)
    } else {
      logMissingClip(type, `die-from-${attackerNameMap[attacker]}`)
    }
    const hitFromClip = findClipByName(
      clips,
      `hit-from-${attackerNameMap[attacker]}`
    )
    if (hitFromClip) {
      hitFrom[attacker] = mixer.clipAction(hitFromClip)
    } else {
      logMissingClip(type, `hit-from-${attackerNameMap[attacker]}`)
    }
  })
  const actions = {
    idle: idleClip ? mixer.clipAction(idleClip) : undefined,
    walk: walkClip ? mixer.clipAction(walkClip) : undefined,
    attack: attackClip ? mixer.clipAction(attackClip) : undefined,
    ready: readyClip ? mixer.clipAction(readyClip) : undefined,
    hit: hitClip ? mixer.clipAction(hitClip) : undefined,
    die: dieClip ? mixer.clipAction(dieClip) : undefined,
    dieFrom,
    hitFrom,
  }
  const namedActions: Record<string, THREE.AnimationAction> = {}
  clips.forEach((clip) => {
    namedActions[clip.name.toLowerCase()] = mixer.clipAction(clip)
  })

  if (actions.idle) {
    const clipDuration = actions.idle.getClip().duration || 1
    const idleOffset = Math.random() * clipDuration
    actions.idle.reset()
    actions.idle.play()
    actions.idle.time = idleOffset
    actions.idle.paused = false
    actions.idle.setEffectiveTimeScale(1)
    actions.idle.setEffectiveWeight(1)
  }

  const position = boardToWorld(file, rank)
  root.position.set(position.x, TILE_HEIGHT, position.z)
  root.userData.isPiece = true
  root.userData.pieceId = `${color}${type}-${entityCounter}`
  root.userData.color = color
  root.userData.type = type
  root.userData.boardPos = { file, rank }

  const entity: PieceEntity = {
    id: root.userData.pieceId as string,
    color,
    type,
    boardPos: { file, rank },
    root,
    mixer,
    activeAction: actions.idle,
    actions,
    namedActions,
    state: 'idle',
  }

  entityCounter += 1
  entities.push(entity)
  return entity
}

export function updatePieceEntities(deltaTime: number) {
  for (const entity of entities) {
    if (entity.moveTarget && entity.moveSpeed) {
      const current = entity.root.position
      const toTarget = new THREE.Vector3().subVectors(
        entity.moveTarget,
        current
      )
      const distance = toTarget.length()
      if (distance <= entity.moveSpeed * deltaTime) {
        current.copy(entity.moveTarget)
        entity.moveTarget = undefined
        const onComplete = entity.onMoveComplete
        entity.onMoveComplete = undefined
        onComplete?.()
      } else {
        toTarget.normalize()
        current.addScaledVector(toTarget, entity.moveSpeed * deltaTime)
      }
    }
    if (entity.rotationTarget && entity.rotationSpeed) {
      const current = entity.root.quaternion
      const target = entity.rotationTarget
      const angle = current.angleTo(target)
      const step = entity.rotationSpeed * deltaTime
      if (angle <= step) {
        current.copy(target)
        entity.rotationTarget = undefined
        entity.rotationSpeed = undefined
      } else {
        const t = step / angle
        current.slerp(target, t)
      }
    }
    entity.mixer.update(deltaTime)
  }
}

export function removePieceEntity(entity: PieceEntity) {
  const index = entities.indexOf(entity)
  if (index >= 0) {
    entities.splice(index, 1)
  }
}

export function setPieceMove(
  entity: PieceEntity,
  target: THREE.Vector3,
  speed: number,
  onComplete?: () => void
) {
  entity.moveTarget = target.clone()
  entity.moveSpeed = speed
  entity.onMoveComplete = onComplete
}

export function stopPieceMove(entity: PieceEntity) {
  entity.moveTarget = undefined
  entity.moveSpeed = undefined
  entity.onMoveComplete = undefined
}

export function setPieceRotation(
  entity: PieceEntity,
  target: THREE.Quaternion,
  speed: number
) {
  entity.rotationTarget = target.clone()
  entity.rotationSpeed = speed
}
