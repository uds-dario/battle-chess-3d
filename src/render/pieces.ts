import * as THREE from 'three'
import type { ChessEngine, Color, PieceType } from '../game/chessEngine'
import { boardToWorld, TILE_HEIGHT, TILE_SIZE } from './board'

const pieceMeshes = new Map<string, THREE.Object3D>()
const squareToPiece = new Map<string, string>()
let pieceCounter = 0

const WHITE_COLOR = 0xf2efe8
const BLACK_COLOR = 0x2f2f2f

function squareKey(file: number, rank: number) {
  return `${file},${rank}`
}

function pieceHeight(type: PieceType) {
  switch (type) {
    case 'p':
      return 0.55
    case 'r':
      return 0.9
    case 'n':
      return 0.95
    case 'b':
      return 1.05
    case 'q':
      return 1.2
    case 'k':
      return 1.35
    default:
      return 0.8
  }
}

function createMaterial(color: Color) {
  return new THREE.MeshStandardMaterial({
    color: color === 'w' ? WHITE_COLOR : BLACK_COLOR,
    roughness: 0.55,
    metalness: 0.1,
  })
}

function markMesh(mesh: THREE.Mesh) {
  if (mesh.material instanceof THREE.MeshStandardMaterial) {
    mesh.userData.baseColor = mesh.material.color.getHex()
  }
}

function createPieceMesh(type: PieceType, color: Color) {
  const height = pieceHeight(type)
  const material = createMaterial(color)
  const group = new THREE.Group()

  if (type === 'p') {
    const geometry = new THREE.CylinderGeometry(0.28, 0.32, height, 18)
    const body = new THREE.Mesh(geometry, material.clone())
    body.castShadow = true
    markMesh(body)
    group.add(body)
  } else if (type === 'r') {
    const geometry = new THREE.BoxGeometry(0.6, height, 0.6)
    const body = new THREE.Mesh(geometry, material.clone())
    body.castShadow = true
    markMesh(body)
    group.add(body)
  } else if (type === 'n') {
    const bodyGeometry = new THREE.CylinderGeometry(0.28, 0.34, height * 0.65, 18)
    const headGeometry = new THREE.SphereGeometry(0.28, 16, 12)
    const body = new THREE.Mesh(bodyGeometry, material.clone())
    body.position.y = -0.05
    body.castShadow = true
    markMesh(body)
    const head = new THREE.Mesh(headGeometry, material.clone())
    head.position.y = height * 0.25
    head.castShadow = true
    markMesh(head)
    group.add(body, head)
  } else if (type === 'b') {
    const bodyGeometry = new THREE.CylinderGeometry(0.22, 0.36, height, 18)
    const headGeometry = new THREE.SphereGeometry(0.22, 16, 12)
    const body = new THREE.Mesh(bodyGeometry, material.clone())
    body.castShadow = true
    markMesh(body)
    const head = new THREE.Mesh(headGeometry, material.clone())
    head.position.y = height * 0.35
    head.castShadow = true
    markMesh(head)
    group.add(body, head)
  } else if (type === 'q') {
    const bodyGeometry = new THREE.CylinderGeometry(0.28, 0.38, height, 18)
    const crownGeometry = new THREE.TorusGeometry(0.22, 0.05, 10, 20)
    const body = new THREE.Mesh(bodyGeometry, material.clone())
    body.castShadow = true
    markMesh(body)
    const crown = new THREE.Mesh(crownGeometry, material.clone())
    crown.rotation.x = Math.PI / 2
    crown.position.y = height * 0.35
    crown.castShadow = true
    markMesh(crown)
    group.add(body, crown)
  } else {
    const bodyGeometry = new THREE.CylinderGeometry(0.3, 0.4, height, 18)
    const crownGeometry = new THREE.BoxGeometry(0.18, 0.45, 0.18)
    const body = new THREE.Mesh(bodyGeometry, material.clone())
    body.castShadow = true
    markMesh(body)
    const crown = new THREE.Mesh(crownGeometry, material.clone())
    crown.position.y = height * 0.35
    crown.castShadow = true
    markMesh(crown)
    group.add(body, crown)
  }

  const baseGeometry = new THREE.CylinderGeometry(0.36, 0.4, 0.12, 20)
  const base = new THREE.Mesh(baseGeometry, material.clone())
  base.position.y = -height / 2 + 0.06
  base.castShadow = true
  markMesh(base)
  group.add(base)

  group.userData.isPiece = true
  group.userData.type = type
  group.userData.color = color
  group.userData.height = height
  return group
}

export function spawnPieces(scene: THREE.Scene, engine: ChessEngine) {
  pieceMeshes.forEach((mesh) => {
    mesh.parent?.remove(mesh)
  })
  pieceMeshes.clear()
  squareToPiece.clear()
  pieceCounter = 0

  const board = engine.getBoard()
  for (let boardRank = 0; boardRank < 8; boardRank += 1) {
    for (let file = 0; file < 8; file += 1) {
      const piece = board[boardRank][file]
      if (!piece) continue

      const rank = 7 - boardRank
      const pieceId = `${piece.color}${piece.type}-${pieceCounter}`
      pieceCounter += 1

      const mesh = createPieceMesh(piece.type, piece.color)
      const position = boardToWorld(file, rank)
      const height = mesh.userData.height as number
      mesh.position.set(position.x, TILE_HEIGHT + height / 2, position.z)
      mesh.userData.pieceId = pieceId
      mesh.userData.boardPos = { file, rank }
      mesh.castShadow = true
      scene.add(mesh)

      pieceMeshes.set(pieceId, mesh)
      squareToPiece.set(squareKey(file, rank), pieceId)
    }
  }
}

export function updatePiecePosition(pieceId: string, file: number, rank: number) {
  const mesh = pieceMeshes.get(pieceId)
  if (!mesh) return
  const previous = mesh.userData.boardPos as { file: number; rank: number }
  if (previous) {
    squareToPiece.delete(squareKey(previous.file, previous.rank))
  }
  const position = boardToWorld(file, rank)
  const height = mesh.userData.height as number
  mesh.position.set(position.x, TILE_HEIGHT + height / 2, position.z)
  mesh.userData.boardPos = { file, rank }
  squareToPiece.set(squareKey(file, rank), pieceId)
}

export function getPieceMeshes() {
  return Array.from(pieceMeshes.values())
}

export function getPieceIdAt(file: number, rank: number) {
  return squareToPiece.get(squareKey(file, rank)) ?? null
}

export function removePiece(pieceId: string) {
  const mesh = pieceMeshes.get(pieceId)
  if (!mesh) return
  const previous = mesh.userData.boardPos as { file: number; rank: number }
  if (previous) {
    squareToPiece.delete(squareKey(previous.file, previous.rank))
  }
  mesh.parent?.remove(mesh)
  pieceMeshes.delete(pieceId)
}
