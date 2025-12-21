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

async function loadModel(url: string) {
  try {
    const gltf = await loader.loadAsync(url)
    return gltf.scene
  } catch (error) {
    console.warn(`Failed to load model ${url}, using placeholder.`, error)
    return new THREE.Group()
  }
}

async function loadClips(url: string) {
  try {
    const gltf = await loader.loadAsync(url)
    return gltf.animations
  } catch (error) {
    console.warn(`Failed to load animations ${url}, using empty clips.`, error)
    return []
  }
}

const pieceTypes: PieceType[] = ['p', 'r', 'n', 'b', 'q', 'k']

async function loadTemplatesFor(
  color: 'white' | 'black'
): Promise<Record<PieceType, THREE.Object3D>> {
  const entries = await Promise.all(
    pieceTypes.map(async (type) => {
      const url = CHARACTER_DEFS[color].models[type]
      const model = await loadModel(url)
      return [type, model] as const
    })
  )
  return Object.fromEntries(entries) as Record<PieceType, THREE.Object3D>
}

async function loadClipsForType(
  color: 'white' | 'black',
  type: PieceType
): Promise<[PieceType, THREE.AnimationClip[]]> {
  const url = CHARACTER_DEFS.animations[color][type]
  const clips = await loadClips(url)
  return [type, clips]
}

export function loadCharacterAssets(): Promise<CharacterAssets> {
  if (assetsPromise) return assetsPromise

  assetsPromise = Promise.all([
    loadTemplatesFor('white'),
    loadTemplatesFor('black'),
    Promise.all(pieceTypes.map((type) => loadClipsForType('white', type))),
    Promise.all(pieceTypes.map((type) => loadClipsForType('black', type))),
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
