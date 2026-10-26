export type TerrainSample = {
  x: number
  z: number
  height: number
  land: boolean
}

export type IslandTerrain = {
  width: number
  depth: number
  segments: number
  heights: Float32Array
  landMask: Uint8Array
}

const DEFAULT_SEGMENTS = 128
const ISLAND_WIDTH = 220
const ISLAND_DEPTH = 220

// Normalized island coordinates span [-0.5, 0.5] on each axis; positive z is the rear.
function seededRandom(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let value = state
    value = Math.imul(value ^ (value >>> 15), value | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = Math.max(0, Math.min(1, (value - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

function gaussian(x: number, z: number, centerX: number, centerZ: number, radiusX: number, radiusZ: number): number {
  const dx = (x - centerX) / radiusX
  const dz = (z - centerZ) / radiusZ
  return Math.exp(-0.5 * (dx * dx + dz * dz))
}

function heightAt(x: number, z: number, random: number): number {
  const normalizedX = x / (ISLAND_WIDTH / 2)
  const normalizedZ = z / (ISLAND_DEPTH / 2)
  const radialNoise = 0.045 * Math.sin(normalizedX * 11 + 0.7) * Math.cos(normalizedZ * 9 - 0.4)
    + 0.022 * Math.sin(normalizedX * 17 + normalizedZ * 13)
  const radius = Math.sqrt((normalizedX / 1.18) ** 2 + (normalizedZ / 1.18) ** 2) + radialNoise
  const island = 1 - smoothstep(0.88, 1.16, radius)
  const mapEdge = Math.max(Math.abs(normalizedX), Math.abs(normalizedZ))
  const edgeFalloff = 1 - smoothstep(0.88, 0.995, mapEdge)
  const islandFootprint = island * edgeFalloff
  // A broad notch opens the western coast while leaving the adjacent inland shore intact.
  const harbor = gaussian(normalizedX, normalizedZ, -0.68, 0, 0.055, 0.5)
  const harborCut = 1 - smoothstep(0.35, 0.7, harbor)

  const plains = 0.65 + 0.08 * Math.sin(normalizedX * 5.2 + 0.3) * Math.cos(normalizedZ * 4.6)
    + 0.045 * Math.sin(normalizedX * 8.1 - normalizedZ * 5.3)
  const broadRelief = 0.7 * Math.sin(normalizedX * 3.6 + 0.4) * Math.cos(normalizedZ * 3.1 - 0.2)
    + 0.32 * Math.sin(normalizedX * 6.2 - normalizedZ * 2.4)
  const ridgeBand = smoothstep(0.08, 0.2, normalizedZ) * (1 - smoothstep(0.72, 0.9, normalizedZ))
  const rearRidge = ridgeBand * (0.85 + 0.12 * Math.sin(normalizedX * 8) + 0.08 * Math.sin(normalizedX * 19))
  const summitCenters = [-0.49, -0.27, -0.04, 0.2, 0.45]
  const lowHills = summitCenters.reduce((sum, center, index) => sum
    + (index % 2 === 0 ? 0.6 : 0.45) * gaussian(normalizedX, normalizedZ, center, 0.45, 0.11, 0.15), 0)
  const variation = (random - 0.5) * 0.025
  const inlandHeight = Math.max(0.35, plains + broadRelief + rearRidge + lowHills + variation)
  const islandCoverage = islandFootprint * harborCut
  return inlandHeight * islandCoverage - 1.1 * (1 - islandCoverage)
}

export function createIslandTerrain(seed: number, segments = DEFAULT_SEGMENTS): IslandTerrain {
  if (!Number.isInteger(segments) || segments < 1) {
    throw new RangeError('segments must be a positive integer')
  }

  const side = segments + 1
  const heights = new Float32Array(side * side)
  const landMask = new Uint8Array(side * side)
  const random = seededRandom(seed)

  for (let row = 0; row <= segments; row += 1) {
    const z = (row / segments - 0.5) * ISLAND_DEPTH
    for (let column = 0; column <= segments; column += 1) {
      const x = (column / segments - 0.5) * ISLAND_WIDTH
      const index = row * side + column
      const height = heightAt(x, z, random())
      heights[index] = height
      landMask[index] = height > 0 ? 1 : 0
    }
  }

  return { width: ISLAND_WIDTH, depth: ISLAND_DEPTH, segments, heights, landMask }
}

export function sampleIslandTerrain(terrain: IslandTerrain, x: number, z: number): TerrainSample {
  const { width, depth, segments } = terrain
  const side = segments + 1
  const gridX = Math.max(0, Math.min(segments, ((x / width) + 0.5) * segments))
  const gridZ = Math.max(0, Math.min(segments, ((z / depth) + 0.5) * segments))
  const x0 = Math.floor(gridX)
  const z0 = Math.floor(gridZ)
  const x1 = Math.min(segments, x0 + 1)
  const z1 = Math.min(segments, z0 + 1)
  const tx = gridX - x0
  const tz = gridZ - z0
  const at = (column: number, row: number) => terrain.heights[row * side + column]
  const top = at(x0, z0) * (1 - tx) + at(x1, z0) * tx
  const bottom = at(x0, z1) * (1 - tx) + at(x1, z1) * tx
  const height = top * (1 - tz) + bottom * tz

  return { x, z, height, land: height > 0 }
}
