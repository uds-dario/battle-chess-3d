import * as THREE from 'three'

export const TILE_SIZE = 1
export const TILE_HEIGHT = 0.2

export type BoardTile = THREE.Mesh<
  THREE.BoxGeometry,
  THREE.MeshStandardMaterial
>

export function boardToWorld(file: number, rank: number): THREE.Vector3 {
  const x = (file - 3.5) * TILE_SIZE
  const z = (rank - 3.5) * TILE_SIZE
  const y = TILE_HEIGHT / 2
  return new THREE.Vector3(x, y, z)
}

export function createBoard(scene: THREE.Scene): BoardTile[] {
  const tiles: BoardTile[] = []
  const lightColor = new THREE.Color(0xe8dfd0)
  const darkColor = new THREE.Color(0x7a6046)

  for (let rank = 0; rank < 8; rank += 1) {
    for (let file = 0; file < 8; file += 1) {
      const geometry = new THREE.BoxGeometry(
        TILE_SIZE,
        TILE_HEIGHT,
        TILE_SIZE
      )
      const isLight = (file + rank) % 2 === 0
      const material = new THREE.MeshStandardMaterial({
        color: isLight ? lightColor : darkColor,
      })
      const tile = new THREE.Mesh(geometry, material) as BoardTile
      const position = boardToWorld(file, rank)
      tile.position.copy(position)
      tile.receiveShadow = true
      tile.userData.isTile = true
      tile.userData.boardPos = { file, rank }
      ;(tile as any).boardPos = { file, rank }
      scene.add(tile)
      tiles.push(tile)
    }
  }

  return tiles
}
