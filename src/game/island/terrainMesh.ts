import * as THREE from 'three'
import type { IslandTerrain } from './terrain'
import { computeTerrainVertexColor, TERRAIN_PALETTE } from './terrainColor'

type TerrainVertex = {
  x: number
  y: number
  z: number
  color: THREE.Color
}

/**
 * Builds the clipped island terrain BufferGeometry with biome vertex coloring based on elevation, slope, and spatial biomes.
 */
export function createTerrainGeometry(terrain: IslandTerrain): THREE.BufferGeometry {
  const side = terrain.segments + 1
  const cellSize = terrain.width / terrain.segments
  const seabedLimit = -5.8

  let peakHeight = 0
  for (let i = 0; i < terrain.heights.length; i += 1) {
    if (terrain.heights[i] > peakHeight) peakHeight = terrain.heights[i]
  }

  const snowStart = peakHeight * 0.72
  const snowFull = peakHeight * 0.92
  const vertices: TerrainVertex[] = []
  const indices: number[] = []
  const vertexIds = new Map<string, number>()

  const getTerrainVertex = (index: number): TerrainVertex => {
    const height = terrain.heights[index]
    const column = index % side
    const row = Math.floor(index / side)
    const left = terrain.heights[row * side + Math.max(0, column - 1)]
    const right = terrain.heights[row * side + Math.min(terrain.segments, column + 1)]
    const back = terrain.heights[Math.max(0, row - 1) * side + column]
    const front = terrain.heights[Math.min(terrain.segments, row + 1) * side + column]
    const dz_dx = (right - left) / (2 * cellSize)
    const dz_dz = (front - back) / (2 * cellSize)
    const slopeDeg = Math.atan(Math.hypot(dz_dx, dz_dz)) * (180 / Math.PI)

    const worldX = ((index % side) / terrain.segments - 0.5) * terrain.width
    const worldZ = (Math.floor(index / side) / terrain.segments - 0.5) * terrain.depth

    const color = computeTerrainVertexColor({
      height,
      slopeDeg,
      worldX,
      worldZ,
      snowStart,
      snowFull,
    })

    return {
      x: worldX,
      y: height,
      z: worldZ,
      color,
    }
  }

  const addVertex = (key: string, vertex: TerrainVertex) => {
    const existing = vertexIds.get(key)
    if (existing !== undefined) return existing
    const index = vertices.push(vertex) - 1
    vertexIds.set(key, index)
    return index
  }

  const intersection = (from: TerrainVertex, to: TerrainVertex, height: number): TerrainVertex => {
    const amount = (from.y - height) / (from.y - to.y)
    return {
      x: THREE.MathUtils.lerp(from.x, to.x, amount),
      y: height,
      z: THREE.MathUtils.lerp(from.z, to.z, amount),
      color: TERRAIN_PALETTE.deepSeabed,
    }
  }

  const addClippedTriangle = (sourceIndices: number[]) => {
    const polygon: Array<{ vertex: TerrainVertex; key: string }> = []
    let previousIndex = sourceIndices[sourceIndices.length - 1]
    let previous = getTerrainVertex(previousIndex)
    let previousInside = previous.y >= seabedLimit

    for (const currentIndex of sourceIndices) {
      const current = getTerrainVertex(currentIndex)
      const currentInside = current.y >= seabedLimit
      if (currentInside !== previousInside) {
        const first = Math.min(previousIndex, currentIndex)
        const second = Math.max(previousIndex, currentIndex)
        const key = `edge:${first}:${second}`
        const point = intersection(previous, current, seabedLimit)
        polygon.push({ vertex: point, key })
      }
      if (currentInside) polygon.push({ vertex: current, key: `vertex:${currentIndex}` })
      previousIndex = currentIndex
      previous = current
      previousInside = currentInside
    }

    if (polygon.length < 3) return
    const first = addVertex(polygon[0].key, polygon[0].vertex)
    for (let index = 1; index < polygon.length - 1; index += 1) {
      indices.push(
        first,
        addVertex(polygon[index].key, polygon[index].vertex),
        addVertex(polygon[index + 1].key, polygon[index + 1].vertex),
      )
    }
  }

  for (let row = 0; row < terrain.segments; row += 1) {
    for (let column = 0; column < terrain.segments; column += 1) {
      const a = row * side + column
      const b = a + 1
      const c = a + side
      const d = c + 1
      addClippedTriangle([a, c, b])
      addClippedTriangle([b, c, d])
    }
  }

  const positions = new Float32Array(vertices.length * 3)
  const colors = new Float32Array(vertices.length * 3)
  vertices.forEach((vertex, index) => {
    positions.set([vertex.x, vertex.y, vertex.z], index * 3)
    colors.set([vertex.color.r, vertex.color.g, vertex.color.b], index * 3)
  })

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()

  return geometry
}
