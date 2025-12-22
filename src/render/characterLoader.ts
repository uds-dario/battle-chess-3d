import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { CHARACTER_DEFS } from '../assets/characters'
import type { PieceType } from '../game/chessEngine'

export type CharacterAssets = {
  templates: {
    white: Record<PieceType, THREE.Object3D>
    black: Record<PieceType, THREE.Object3D>
  }
  clips: {
    white: Record<PieceType, THREE.AnimationClip[]>
    black: Record<PieceType, THREE.AnimationClip[]>
  }
}

const loader = new GLTFLoader()
let assetsPromise: Promise<CharacterAssets> | null = null

async function loadModel(
  url: string,
  label?: string,
  onProgress?: (label: string) => void
) {
  try {
    if (label && onProgress) onProgress(label)
    const gltf = await loader.loadAsync(url)
    return gltf.scene
  } catch (error) {
    console.warn(`Failed to load model ${url}, using placeholder.`, error)
    return new THREE.Group()
  }
}

async function loadClips(
  url: string,
  label?: string,
  onProgress?: (label: string) => void
) {
  try {
    if (label && onProgress) onProgress(label)
    const gltf = await loader.loadAsync(url)
    return gltf.animations
  } catch (error) {
    console.warn(`Failed to load animations ${url}, using empty clips.`, error)
    return []
  }
}

const pieceTypes: PieceType[] = ['p', 'r', 'n', 'b', 'q', 'k']

function pieceLabel(type: PieceType) {
  switch (type) {
    case 'p':
      return 'pawn'
    case 'r':
      return 'rook'
    case 'n':
      return 'knight'
    case 'b':
      return 'bishop'
    case 'q':
      return 'queen'
    case 'k':
      return 'king'
    default:
      return type
  }
}

async function loadTemplatesFor(
  color: 'white' | 'black',
  onProgress?: (label: string) => void
): Promise<Record<PieceType, THREE.Object3D>> {
  const entries = await Promise.all(
    pieceTypes.map(async (type) => {
      const url = CHARACTER_DEFS[color].models[type]
      const label = `${color} ${pieceLabel(type)} model`
      const model = await loadModel(url, label, onProgress)
      return [type, model] as const
    })
  )
  return Object.fromEntries(entries) as Record<PieceType, THREE.Object3D>
}

async function loadClipsForType(
  color: 'white' | 'black',
  type: PieceType,
  onProgress?: (label: string) => void
): Promise<[PieceType, THREE.AnimationClip[]]> {
  const url = CHARACTER_DEFS.animations[color][type]
  const label = `${color} ${pieceLabel(type)} animations`
  const clips = await loadClips(url, label, onProgress)
  return [type, clips]
}

export function loadCharacterAssets(
  onProgress?: (label: string) => void
): Promise<CharacterAssets> {
  if (assetsPromise) return assetsPromise

  assetsPromise = Promise.all([
    loadTemplatesFor('white', onProgress),
    loadTemplatesFor('black', onProgress),
    Promise.all(
      pieceTypes.map((type) => loadClipsForType('white', type, onProgress))
    ),
    Promise.all(
      pieceTypes.map((type) => loadClipsForType('black', type, onProgress))
    ),
  ]).then(([whiteModels, blackModels, whiteClipEntries, blackClipEntries]) => ({
    templates: {
      white: whiteModels,
      black: blackModels,
    },
    clips: {
      white: Object.fromEntries(whiteClipEntries) as Record<
        PieceType,
        THREE.AnimationClip[]
      >,
      black: Object.fromEntries(blackClipEntries) as Record<
        PieceType,
        THREE.AnimationClip[]
      >,
    },
  }))

  return assetsPromise
}
