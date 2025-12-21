import './style.css'
import * as THREE from 'three'
import { WebGPURenderer } from 'three/webgpu'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { ChessEngine } from './game/chessEngine'
import { loadAttackSequences } from './game/attackSequences'
import { loadPieceAttributes } from './game/pieceAttributes'
import { createBoard, TILE_HEIGHT, TILE_SIZE } from './render/board'
import { loadCharacterAssets } from './render/characterLoader'
import { getRimLightConfig, loadSceneLighting } from './render/sceneLighting'
import {
  getPieceAtSquare,
  getPieceById,
  getPieceRoots,
  initPieces,
  movePieceEntity,
} from './game/pieceManager'
import { updatePieceEntities } from './render/pieceEntities'

const canvasId = 'app-canvas'
const appRoot = document.querySelector<HTMLDivElement>('#app') ?? document.body
let canvas = document.getElementById(canvasId) as HTMLCanvasElement | null

type Preloader = {
  show: () => void
  hide: () => void
  setText: (text: string) => void
}

function createPreloader(): Preloader {
  const overlay = document.createElement('div')
  overlay.id = 'preloader'
  overlay.innerHTML = `
    <div class="preloader-card">
      <div class="preloader-spinner" aria-hidden="true"></div>
      <div class="preloader-text">Loading...</div>
    </div>
  `
  appRoot.appendChild(overlay)
  const textEl = overlay.querySelector('.preloader-text') as HTMLDivElement | null
  return {
    show: () => {
      overlay.classList.remove('is-hidden')
    },
    hide: () => {
      overlay.classList.add('is-hidden')
    },
    setText: (text: string) => {
      if (textEl) textEl.textContent = text
    },
  }
}

const preloader = createPreloader()

if (!canvas) {
  canvas = document.createElement('canvas')
  canvas.id = canvasId
  appRoot.appendChild(canvas)
}

function squareFromCoords(file: number, rank: number) {
  const fileChar = String.fromCharCode(97 + file)
  return `${fileChar}${rank + 1}`
}

function coordsFromSquare(square: string) {
  const file = square.charCodeAt(0) - 97
  const rank = parseInt(square[1], 10) - 1
  return { file, rank }
}

async function createRenderer(target: HTMLCanvasElement) {
  const hasWebGPU = 'gpu' in navigator

  if (hasWebGPU) {
    const renderer = new WebGPURenderer({
      antialias: true,
      canvas: target,
    })
    await renderer.init()
    renderer.setSize(window.innerWidth, window.innerHeight)
    renderer.setPixelRatio(window.devicePixelRatio)
    renderer.shadowMap.enabled = true
    return renderer
  }

  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    canvas: target,
  })
  renderer.setSize(window.innerWidth, window.innerHeight)
  renderer.setPixelRatio(window.devicePixelRatio)
  renderer.shadowMap.enabled = true
  return renderer
}

function setPieceHighlight(mesh: THREE.Object3D, enabled: boolean) {
  mesh.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return
    const materials = Array.isArray(child.material)
      ? child.material
      : [child.material]
    const baseColors =
      (child.userData.baseColors as number[] | undefined) ?? []
    materials.forEach((material, index) => {
      if (!('color' in material)) return
      const colorMaterial = material as THREE.MeshStandardMaterial
      if (baseColors[index] === undefined) {
        baseColors[index] = colorMaterial.color.getHex()
      }
      colorMaterial.color.setHex(
        enabled ? 0xffd166 : (baseColors[index] as number)
      )
    })
    child.userData.baseColors = baseColors
  })
}

async function init() {
  const renderer = await createRenderer(canvas)
  await loadSceneLighting()
  const rimLightConfig = getRimLightConfig()

  const scene = new THREE.Scene()
  scene.background = new THREE.Color(0x121418)

  const camera = new THREE.PerspectiveCamera(
    45,
    window.innerWidth / window.innerHeight,
    0.1,
    100
  )
  camera.position.set(8, 12, 14)
  camera.lookAt(0, 0, 0)

  const controls = new OrbitControls(camera, renderer.domElement)
  controls.enableDamping = true
  controls.dampingFactor = 0.08
  controls.target.set(0, 0, 0)
  controls.update()

  const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 0.9)
  scene.add(hemiLight)

  const dirLight = new THREE.DirectionalLight(0xffffff, 1)
  dirLight.position.set(6, 10, 8)
  dirLight.castShadow = true
  dirLight.shadow.mapSize.set(1024, 1024)
  dirLight.shadow.camera.near = 0.5
  dirLight.shadow.camera.far = 50
  scene.add(dirLight)

  if (rimLightConfig.enabled) {
    const rimLight = new THREE.DirectionalLight(
      rimLightConfig.color,
      rimLightConfig.intensity
    )
    rimLight.position.set(
      rimLightConfig.position.x,
      rimLightConfig.position.y,
      rimLightConfig.position.z
    )
    scene.add(rimLight)

    if (rimLightConfig.helper) {
      const rimHelper = new THREE.DirectionalLightHelper(
        rimLight,
        0.6,
        0xffffff
      )
      scene.add(rimHelper)
    }
  }

  const boardTiles = createBoard(scene)

  const highlightMaterial = new THREE.MeshStandardMaterial({
    color: 0x4cc9f0,
    transparent: true,
    opacity: 0.35,
  })
  boardTiles.forEach((tile) => {
    const overlay = new THREE.Mesh(
      new THREE.BoxGeometry(TILE_SIZE, 0.03, TILE_SIZE),
      highlightMaterial.clone()
    )
    overlay.position.y = TILE_HEIGHT / 2 + 0.02
    overlay.visible = false
    overlay.userData.isHighlight = true
    overlay.raycast = () => null
    tile.add(overlay)
    tile.userData.highlight = overlay
  })

  const engine = new ChessEngine()
  preloader.setText('Loading assets...')
  const characterAssets = await loadCharacterAssets()
  await loadAttackSequences()
  await loadPieceAttributes()
  initPieces(scene, engine, characterAssets)
  preloader.hide()

  const raycaster = new THREE.Raycaster()
  const pointer = new THREE.Vector2()
  let selectedPieceId: string | null = null
  const clock = new THREE.Clock()

  const clearHighlights = () => {
    boardTiles.forEach((tile) => {
      const overlay = tile.userData.highlight as THREE.Mesh | undefined
      if (overlay) overlay.visible = false
    })
  }

  const showLegalMoves = (fromFile: number, fromRank: number) => {
    clearHighlights()
    const fromSquare = squareFromCoords(fromFile, fromRank)
    const legalMoves = engine.getLegalMoves(fromSquare)
    legalMoves.forEach((square) => {
      const { file, rank } = coordsFromSquare(square)
      const tile = boardTiles.find(
        (candidate) =>
          candidate.userData.boardPos?.file === file &&
          candidate.userData.boardPos?.rank === rank
      )
      const overlay = tile?.userData.highlight as THREE.Mesh | undefined
      if (overlay) overlay.visible = true
    })
  }

  const clearSelection = () => {
    if (!selectedPieceId) return
    const entity = getPieceById(selectedPieceId)
    if (entity) setPieceHighlight(entity.root, false)
    selectedPieceId = null
    clearHighlights()
  }

  const attemptMove = (toFile: number, toRank: number) => {
    if (!selectedPieceId) return
    const selectedPiece = getPieceById(selectedPieceId)
    if (!selectedPiece) return

    const fromSquare = squareFromCoords(
      selectedPiece.boardPos.file,
      selectedPiece.boardPos.rank
    )
    const toSquare = squareFromCoords(toFile, toRank)

    const legalMoves = engine.getLegalMoves(fromSquare)
    if (!legalMoves.includes(toSquare)) return

    const captured = getPieceAtSquare(toSquare)
    const moveResult = engine.move(fromSquare, toSquare)
    if (!moveResult.success) return

    movePieceEntity(selectedPiece, toFile, toRank, {
      captureTarget: captured,
    })
    setPieceHighlight(selectedPiece.root, false)
    selectedPieceId = null
    clearHighlights()
  }

  const handlePointerDown = (event: PointerEvent) => {
    const rect = renderer.domElement.getBoundingClientRect()
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
    raycaster.setFromCamera(pointer, camera)

    const pieceHits = raycaster.intersectObjects(getPieceRoots(), true)
    if (pieceHits.length > 0) {
      let hit: THREE.Object3D | null = pieceHits[0].object
      while (hit && !hit.userData.isPiece) {
        hit = hit.parent
      }
      if (hit && hit.userData.isPiece) {
        const hitPieceId = hit.userData.pieceId as string
        const hitEntity = getPieceById(hitPieceId)
        if (!hitEntity) return
        const hitColor = hitEntity.color
        const boardPos = hitEntity.boardPos

        if (selectedPieceId && hitPieceId !== selectedPieceId) {
          if (hitColor !== engine.getTurn()) {
            attemptMove(boardPos.file, boardPos.rank)
            return
          }
          const previous = getPieceById(selectedPieceId)
          if (previous) setPieceHighlight(previous.root, false)
          selectedPieceId = hitPieceId
          setPieceHighlight(hit, true)
          showLegalMoves(boardPos.file, boardPos.rank)
          return
        }

        if (hitColor !== engine.getTurn()) {
          return
        }

        if (selectedPieceId) {
          const previous = getPieceById(selectedPieceId)
          if (previous) setPieceHighlight(previous.root, false)
        }
        selectedPieceId = hitPieceId
        setPieceHighlight(hit, true)
        showLegalMoves(boardPos.file, boardPos.rank)
        return
      }
    }

    const tileHits = raycaster.intersectObjects(boardTiles, false)
    if (tileHits.length === 0) {
      clearSelection()
      return
    }

    const tile = tileHits[0].object as THREE.Mesh
    const boardPos = tile.userData.boardPos as { file: number; rank: number }
    if (!boardPos) return
    attemptMove(boardPos.file, boardPos.rank)
  }

  renderer.domElement.addEventListener('pointerdown', handlePointerDown)

  const handleResize = () => {
    camera.aspect = window.innerWidth / window.innerHeight
    camera.updateProjectionMatrix()
    renderer.setSize(window.innerWidth, window.innerHeight)
    renderer.setPixelRatio(window.devicePixelRatio)
  }

  window.addEventListener('resize', handleResize)

  const animate = () => {
    requestAnimationFrame(animate)
    const deltaTime = clock.getDelta()
    updatePieceEntities(deltaTime)
    controls.update()
    renderer.render(scene, camera)
  }

  animate()
}

init().catch((error) => {
  console.error('Renderer initialization failed:', error)
  preloader.setText('Failed to load scene.')
  preloader.show()
})
