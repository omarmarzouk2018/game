import * as THREE from 'three'
import type { IslandTerrain } from './terrain'

type TerrainVertex = {
  x: number
  y: number
  z: number
  color: THREE.Color
}

/**
 * Builds the clipped island terrain BufferGeometry with biome vertex coloring based on elevation and slope.
 */
export function createTerrainGeometry(terrain: IslandTerrain): THREE.BufferGeometry {
  const side = terrain.segments + 1
  const cellSize = terrain.width / terrain.segments
  const seabedLimit = -5.8
  const deepSeabed = new THREE.Color(0x26555b)
  const shallowSeabed = new THREE.Color(0x558f88)
  const beach = new THREE.Color(0xd4b886)
  const grass = new THREE.Color(0x4a7c34)
  const highland = new THREE.Color(0x5d7348)
  const rock = new THREE.Color(0x6b6e6b)
  const snow = new THREE.Color(0xc8d0d4)

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

    let color: THREE.Color
    if (height < -2.0) {
      color = deepSeabed.clone().lerp(shallowSeabed, THREE.MathUtils.smoothstep(height, -5.8, -2.0))
    } else if (height < 0) {
      color = shallowSeabed.clone().lerp(beach, (height + 2.0) / 2.0)
    } else if (height < 1.2) {
      color = beach.clone().lerp(grass, height / 1.2)
    } else if (height < 6.0) {
      color = grass.clone().lerp(highland, (height - 1.2) / 4.8)
    } else if (height < 14.0) {
      color = highland.clone().lerp(rock, (height - 6.0) / 8.0)
    } else if (height < snowStart) {
      color = rock.clone()
    } else {
      color = rock.clone().lerp(snow, Math.min(1, (height - snowStart) / (snowFull - snowStart)))
    }

    if (slopeDeg > 25 && height > 0.5) {
      const cliffFactor = Math.min(0.92, (slopeDeg - 25) / 20)
      color.lerp(rock, cliffFactor)
    }

    return {
      x: ((index % side) / terrain.segments - 0.5) * terrain.width,
      y: height,
      z: (Math.floor(index / side) / terrain.segments - 0.5) * terrain.depth,
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
      color: deepSeabed,
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
