export type TerrainSample = {
  x: number
  z: number
  height: number
  land: boolean
}

/**
 * Unified island biome classification enumeration.
 * Single source of truth for terrain rendering, grass distribution, tree forests, and rock placement.
 */
export enum BiomeType {
  DEEP_WATER = 0,
  SHALLOW_WATER = 1,
  SAND_BEACH = 2,
  FERTILE_GRASS = 3,
  FOREST_SOIL = 4,
  ROCK_CLIFF = 5,
  SNOW_PEAK = 6,
}

export type IslandTerrain = {
  width: number
  depth: number
  segments: number
  heights: Float32Array
  landMask: Uint8Array
  biomes: Uint8Array
}

export const HEIGHT_SCALE = 3.6
const DEFAULT_SEGMENTS = 256
const ISLAND_WIDTH = 440
const ISLAND_DEPTH = 440

/**
 * 3 distinct forest centers situated on the outer edges/outskirts of the island.
 * Leaves the central plains and town clearing open for settlements and exploration.
 */
export const FOREST_CENTERS = [
  { name: 'South-West Edge', x: -100, z: -65, radius: 96 },
  { name: 'South-East Edge', x: 105, z: -70, radius: 96 },
  { name: 'North-East Edge', x: 75, z: 45, radius: 91 },
] as const

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

export function hash2D(ix: number, iz: number, seed = 1337): number {
  let h = Math.imul(ix ^ (seed * 0x85ebca6b), 0x27d4eb2d) ^ Math.imul(iz, 0x165667b1)
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d)
  h ^= h >>> 16
  return ((h >>> 0) / 4294967295) * 2 - 1
}

export function valueNoise2D(x: number, z: number, seed = 1337): number {
  const x0 = Math.floor(x)
  const z0 = Math.floor(z)
  const fx = x - x0
  const fz = z - z0
  const u = fx * fx * (3 - 2 * fx)
  const v = fz * fz * (3 - 2 * fz)

  const v00 = hash2D(x0, z0, seed)
  const v10 = hash2D(x0 + 1, z0, seed)
  const v01 = hash2D(x0, z0 + 1, seed)
  const v11 = hash2D(x0 + 1, z0 + 1, seed)

  const nx0 = v00 * (1 - u) + v10 * u
  const nx1 = v01 * (1 - u) + v11 * u
  return nx0 * (1 - v) + nx1 * v
}

export function fbmNoise2D(x: number, z: number, seed = 1337, octaves = 3): number {
  let value = 0
  let amplitude = 0.5
  let frequency = 1.0
  let sum = 0
  for (let i = 0; i < octaves; i += 1) {
    value += valueNoise2D(x * frequency, z * frequency, seed + i * 101) * amplitude
    sum += amplitude
    frequency *= 2.0
    amplitude *= 0.5
  }
  return value / sum
}

export function ridgedNoise2D(x: number, z: number, seed = 1337, octaves = 3): number {
  let value = 0
  let amplitude = 0.5
  let frequency = 1.0
  let weight = 1.0
  let sum = 0
  for (let i = 0; i < octaves; i += 1) {
    const n = valueNoise2D(x * frequency, z * frequency, seed + i * 317)
    // 1 - abs(n) gives sharp inverted creases; squaring sharpens the crest
    let signal = 1.0 - Math.abs(n)
    signal = signal * signal
    value += signal * amplitude * weight
    weight = Math.min(1.0, signal * 2.0)
    sum += amplitude
    frequency *= 2.1
    amplitude *= 0.5
  }
  return value / sum
}

function heightAt(x: number, z: number, random: number): number {
  const normalizedX = x / (ISLAND_WIDTH / 2)
  const normalizedZ = z / (ISLAND_DEPTH / 2)
  const radialNoise = 0.055 * Math.sin(normalizedX * 11 + 0.7) * Math.cos(normalizedZ * 9 - 0.4)
    + 0.026 * Math.sin(normalizedX * 17 + normalizedZ * 13)
  const radius = Math.sqrt((normalizedX / 0.92) ** 2 + (normalizedZ / 0.92) ** 2) + radialNoise
  const island = 1 - smoothstep(0.91, 1.045, radius)
  const mapEdge = Math.max(Math.abs(normalizedX), Math.abs(normalizedZ))
  const edgeFalloff = 1 - smoothstep(0.86, 0.96, mapEdge)
  const islandFootprint = island * edgeFalloff
  // A broad notch opens the western coast while leaving the adjacent inland shore intact.
  const harbor = gaussian(normalizedX, normalizedZ, -0.68, 0, 0.055, 0.5)
  const harborCut = 1 - smoothstep(0.35, 0.7, harbor)

  const plains = 0.48 + 0.045 * Math.sin(normalizedX * 5.2 + 0.3) * Math.cos(normalizedZ * 4.6)
    + 0.025 * Math.sin(normalizedX * 8.1 - normalizedZ * 5.3)
  const broadRelief = 0.24 * Math.sin(normalizedX * 3.6 + 0.4) * Math.cos(normalizedZ * 3.1 - 0.2)
    + 0.11 * Math.sin(normalizedX * 6.2 - normalizedZ * 2.4)

  // Mountain spine in rear (normalizedZ: 0.15 to 0.75, peaking around 0.45)
  const spineZ = 0.46 + 0.07 * Math.sin(normalizedX * 3.2 + 0.5)
  const distToSpine = Math.abs(normalizedZ - spineZ)
  const spineMask = smoothstep(0.34, 0.06, distToSpine) * smoothstep(0.90, 0.65, Math.abs(normalizedX))

  // Sharp ridged noise for crisp, alpine mountain crests
  const ridge = ridgedNoise2D(normalizedX * 4.8 + 0.3, normalizedZ * 4.8 - 0.2, 41723, 3)
  const ridgeDetail = ridgedNoise2D(normalizedX * 9.6 - 1.1, normalizedZ * 9.6 + 0.8, 88231, 2)
  const sharpRidge = ridge * 0.75 + ridgeDetail * 0.25
  const mountainSpine = spineMask * (sharpRidge * 15.2)

  // Foothills: undulating transition from mountain base into plains (height 5-10)
  const foothillBand = smoothstep(0.52, 0.22, distToSpine) * smoothstep(0.85, 0.55, Math.abs(normalizedX)) * (1 - spineMask * 0.65)
  const foothillNoise = 0.5 + 0.5 * fbmNoise2D(normalizedX * 5.5, normalizedZ * 5.5, 91823, 2)
  const foothills = foothillBand * foothillNoise * 1.45

  // Erosion hint: subtle terracing and talus ledges on intermediate slopes
  const preTerrace = 1.35 + plains - 0.48 + broadRelief + mountainSpine + foothills
  const terracePhase = (preTerrace * 2.2) % 1
  const terrace = (smoothstep(0.2, 0.8, terracePhase) - terracePhase) * 0.12 * smoothstep(2.0, 4.5, preTerrace)
  const variation = (random - 0.5) * 0.015

  // Coastal topography profile:
  // - The front face of the island (South, normalizedZ < 0.05) is a grand, continuous beach.
  // - In the center of this front beach (normalizedX near 0, normalizedZ < -0.10), the slope into the
  //   water is ultra-gentle ("ميول اخف جدااا"), creating an expansive crystal-clear shallow lagoon.
  // - The western coast features a sheltered harbor bay.
  // - The sides (East & West) and the rear (North) consist of steep rocky cliffs plunging into deep water.
  const isHarbor = gaussian(normalizedX, normalizedZ, -0.68, 0, 0.14, 0.55)
  const harborBeach = smoothstep(0.06, 0.40, isHarbor)

  // Continuous sweeping beach along the entire front (South) facade of the island
  const frontX = 1.0 - smoothstep(0.60, 0.80, Math.abs(normalizedX))
  const frontZ = 1.0 - smoothstep(-0.25, 0.15, normalizedZ)
  const frontBeach = frontX * frontZ

  const beachFactor = Math.min(1.0, Math.max(harborBeach, frontBeach))
  const cliffFactor = 1.0 - beachFactor

  // Gentle southern plain gradient: the southern half slopes gracefully down towards the front beach,
  // preventing any sudden 5m cliffs or steep ledges between the inland grass and the sand.
  const southGrad = smoothstep(-0.25, -0.78, normalizedZ) * frontX
  const southDescent = southGrad * 0.72
  const coastalInlandHeight = Math.max(0.65, preTerrace - southDescent + terrace + variation)
  const cliffInlandHeight = Math.max(1.25, preTerrace + terrace + variation)
  const islandCoverage = islandFootprint * harborCut

  // Center front beach with ultra-gentle slope into the water
  const centerBeachX = smoothstep(0.34, 0.04, Math.abs(normalizedX))
  const centerBeachZ = smoothstep(-0.06, -0.28, normalizedZ)
  const isCenterFront = centerBeachX * centerBeachZ

  // Seabed bathymetry:
  // - Steep cliffs: seabed drops precipitously to deep ocean (-5.8m) right off the rock edge.
  // - Standard beaches: gentle slope extending outward into the water.
  // - Ultra-gentle center beach: extremely flat slope extending far out into the ocean
  //   (water stays ultra-shallow 0.08m - 0.45m for an expansive distance, creating crystal clear water).
  const cliffSeabed = 1.2 + 4.6 * smoothstep(0.91, 1.01, radius)
  const standardBeachSeabed = 0.15 + 5.65 * smoothstep(0.86, 1.38, radius)
  const ultraGentleSeabed = 0.08 + 0.95 * smoothstep(0.86, 1.35, radius) + 4.77 * smoothstep(1.30, 1.75, radius)
  const beachSeabed = (1.0 - isCenterFront) * standardBeachSeabed + isCenterFront * ultraGentleSeabed

  // Steep shoreline cliff ramp for rocky coasts
  const cliffShore = smoothstep(0.0, 0.22, islandCoverage)
  const cliffHeight = cliffInlandHeight * HEIGHT_SCALE * cliffShore - cliffSeabed * (1 - islandCoverage)

  // Gentle beach profile: completely seamless, smooth, continuous incline from sea to plains.
  // Eliminates any steep gray cliffs or sudden ledges behind the beach.
  let beachHeight: number
  if (islandCoverage < 0.07) {
    const uw = islandCoverage / 0.07
    beachHeight = -beachSeabed * (1 - smoothstep(0.0, 1.0, uw))
  } else {
    // Soft, smooth continuous roll from shoreline (0.05m) up into the inland plains
    const t = (islandCoverage - 0.07) / 0.88
    const smoothT = smoothstep(0.0, 1.0, Math.min(1.0, t))
    // Soft curve: expansive and gentle near the sand, rolling seamlessly into lush grass
    const gentleT = Math.pow(smoothT, 1.55)
    beachHeight = 0.05 + (coastalInlandHeight * HEIGHT_SCALE - 0.05) * gentleT
  }

  return cliffFactor * cliffHeight + (1 - cliffFactor) * beachHeight
}

let defaultIslandTerrain: IslandTerrain | null = null

export function createIslandTerrain(seed: number, segments = DEFAULT_SEGMENTS): IslandTerrain {
  if (!Number.isInteger(segments) || segments < 1) {
    throw new RangeError('segments must be a positive integer')
  }

  const side = segments + 1
  const heights = new Float32Array(side * side)
  const landMask = new Uint8Array(side * side)
  const biomes = new Uint8Array(side * side)
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

  // Pre-calculate peak height for alpine snow boundary
  let peakHeight = 0
  for (let i = 0; i < heights.length; i += 1) {
    if (heights[i] > peakHeight) peakHeight = heights[i]
  }
  const snowStart = peakHeight * 0.72
  const cellSize = ISLAND_WIDTH / segments

  // Classify unified biome splatmap for each grid vertex
  for (let row = 0; row <= segments; row += 1) {
    const z = (row / segments - 0.5) * ISLAND_DEPTH
    const normalizedZ = z / (ISLAND_DEPTH / 2)
    for (let column = 0; column <= segments; column += 1) {
      const x = (column / segments - 0.5) * ISLAND_WIDTH
      const normalizedX = x / (ISLAND_WIDTH / 2)
      const index = row * side + column
      const height = heights[index]

      if (height < -1.8) {
        biomes[index] = BiomeType.DEEP_WATER
        continue
      }
      if (height <= 0.0) {
        biomes[index] = BiomeType.SHALLOW_WATER
        continue
      }

      // Compute vertex slope from immediate neighbors in the grid
      const left = heights[row * side + Math.max(0, column - 1)]
      const right = heights[row * side + Math.min(segments, column + 1)]
      const back = heights[Math.max(0, row - 1) * side + column]
      const front = heights[Math.min(segments, row + 1) * side + column]
      const dz_dx = (right - left) / (2 * cellSize)
      const dz_dz = (front - back) / (2 * cellSize)
      const slopeDeg = Math.atan(Math.hypot(dz_dx, dz_dz)) * (180 / Math.PI)

      if (height >= snowStart) {
        biomes[index] = BiomeType.SNOW_PEAK
        continue
      }

      const isHighRock = height >= 12.0
      const isSteepCliff = slopeDeg >= 20.0 && height > 2.0
      const isCoastalCliff = slopeDeg >= 15.0 && height <= 2.0 && normalizedZ > -0.05
      if (isHighRock || isSteepCliff || isCoastalCliff) {
        biomes[index] = BiomeType.ROCK_CLIFF
        continue
      }

      // Sandy beaches along the coast and southern bay
      const isFrontBeachZone = normalizedZ < -0.05 && Math.abs(normalizedX) < 0.78 && height < 2.85
      const isLowShoreSand = height < 2.4 && slopeDeg < 15.0
      if (isFrontBeachZone || isLowShoreSand) {
        biomes[index] = BiomeType.SAND_BEACH
        continue
      }

      // Preserve central town clearing for settlement building
      const inTownClearing = Math.abs(x) < 13 && z > -10 && z < 20
      let inForestZone = false
      if (!inTownClearing) {
        for (let k = 0; k < FOREST_CENTERS.length; k += 1) {
          const center = FOREST_CENTERS[k]
          const dist = Math.hypot(x - center.x, z - center.z)
          const borderNoise = valueNoise2D(x * 0.05, z * 0.05, 12873 + k * 1000) * 0.25
          const effectiveRadius = center.radius * (1.0 + borderNoise)
          if (dist < effectiveRadius) {
            inForestZone = true
            break
          }
        }
      }

      if (inForestZone) {
        biomes[index] = BiomeType.FOREST_SOIL
      } else {
        biomes[index] = BiomeType.FERTILE_GRASS
      }
    }
  }

  const terrain = { width: ISLAND_WIDTH, depth: ISLAND_DEPTH, segments, heights, landMask, biomes }
  defaultIslandTerrain = terrain
  const stats = getIslandTerrainStats(terrain)
  console.info(
    `[Terrain] min: ${stats.minHeight.toFixed(2)}, max: ${stats.maxHeight.toFixed(2)}, land: ${stats.landPercent.toFixed(1)}%, slope > 35°: ${stats.steepSlopePercent.toFixed(1)}%`,
  )

  return terrain
}

export type IslandTerrainStats = {
  minHeight: number
  maxHeight: number
  landPercent: number
  steepSlopePercent: number
}

export function getIslandTerrainStats(terrain: IslandTerrain): IslandTerrainStats {
  const { width, segments, heights } = terrain
  const side = segments + 1
  let minHeight = Infinity
  let maxHeight = -Infinity
  let landCount = 0

  for (let i = 0; i < heights.length; i += 1) {
    const h = heights[i]
    if (h < minHeight) minHeight = h
    if (h > maxHeight) maxHeight = h
    if (h > 0) landCount += 1
  }

  const cellSize = width / segments
  let steepCount = 0
  const innerCount = (segments - 1) * (segments - 1)

  for (let r = 1; r < segments; r += 1) {
    for (let c = 1; c < segments; c += 1) {
      const left = heights[r * side + c - 1]
      const right = heights[r * side + c + 1]
      const back = heights[(r - 1) * side + c]
      const front = heights[(r + 1) * side + c]
      const dz_dx = (right - left) / (2 * cellSize)
      const dz_dz = (front - back) / (2 * cellSize)
      const slopeDeg = Math.atan(Math.hypot(dz_dx, dz_dz)) * (180 / Math.PI)
      if (slopeDeg > 35) steepCount += 1
    }
  }

  return {
    minHeight,
    maxHeight,
    landPercent: (landCount / heights.length) * 100,
    steepSlopePercent: innerCount > 0 ? (steepCount / innerCount) * 100 : 0,
  }
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

export function sampleTerrainSlope(terrain: IslandTerrain, x: number, z: number): number {
  const delta = 1.0
  const hRight = sampleIslandTerrain(terrain, x + delta, z).height
  const hLeft = sampleIslandTerrain(terrain, x - delta, z).height
  const hFront = sampleIslandTerrain(terrain, x, z + delta).height
  const hBack = sampleIslandTerrain(terrain, x, z - delta).height
  const dz_dx = (hRight - hLeft) / (2 * delta)
  const dz_dz = (hFront - hBack) / (2 * delta)
  return Math.atan(Math.hypot(dz_dx, dz_dz)) * (180 / Math.PI)
}

export function sampleTerrainNormal(terrain: IslandTerrain, x: number, z: number): { nx: number; ny: number; nz: number } {
  const delta = 1.0
  const hRight = sampleIslandTerrain(terrain, x + delta, z).height
  const hLeft = sampleIslandTerrain(terrain, x - delta, z).height
  const hFront = sampleIslandTerrain(terrain, x, z + delta).height
  const hBack = sampleIslandTerrain(terrain, x, z - delta).height
  const dz_dx = (hRight - hLeft) / (2 * delta)
  const dz_dz = (hFront - hBack) / (2 * delta)
  const len = Math.hypot(-dz_dx, 1, -dz_dz)
  return { nx: -dz_dx / len, ny: 1 / len, nz: -dz_dz / len }
}

/**
 * Checks if a terrain coordinate is buildable:
 * - Must be above water and within plains/foothills height range (1.2 <= height <= 8.0)
 * - Must have a gentle slope (< 15 degrees)
 * Can be called either as isBuildable(terrain, x, z) or as isBuildable(x, z).
 */
export function isBuildable(
  terrainOrX: IslandTerrain | number,
  xOrZ: number,
  zOrUndefined?: number,
): boolean {
  let terrain: IslandTerrain
  let x: number
  let z: number
  if (typeof terrainOrX === 'number') {
    if (!defaultIslandTerrain) {
      defaultIslandTerrain = createIslandTerrain(41723)
    }
    terrain = defaultIslandTerrain
    x = terrainOrX
    z = xOrZ
  } else {
    terrain = terrainOrX
    x = xOrZ
    z = zOrUndefined!
  }

  const sample = sampleIslandTerrain(terrain, x, z)
  if (!sample.land || sample.height < 1.2 || sample.height > 8.0) {
    return false
  }

  const slopeDeg = sampleTerrainSlope(terrain, x, z)
  return slopeDeg < 15.0
}

/**
 * Samples the discrete biome classification at any world coordinate on the island.
 * Single source of truth for all environment systems (rendering, grass, trees, rocks).
 */
export function sampleTerrainBiome(
  terrainOrX: IslandTerrain | number,
  xOrZ: number,
  zOrUndefined?: number,
): BiomeType {
  let terrain: IslandTerrain
  let x: number
  let z: number
  if (typeof terrainOrX === 'number') {
    if (!defaultIslandTerrain) {
      defaultIslandTerrain = createIslandTerrain(41723)
    }
    terrain = defaultIslandTerrain
    x = terrainOrX
    z = xOrZ
  } else {
    terrain = terrainOrX
    x = xOrZ
    z = zOrUndefined!
  }

  const side = terrain.segments + 1
  const halfW = terrain.width / 2
  const halfD = terrain.depth / 2

  const clampedX = Math.max(-halfW, Math.min(halfW, x))
  const clampedZ = Math.max(-halfD, Math.min(halfD, z))

  const col = Math.round(((clampedX + halfW) / terrain.width) * terrain.segments)
  const row = Math.round(((clampedZ + halfD) / terrain.depth) * terrain.segments)
  const index = row * side + col

  if (terrain.biomes && index >= 0 && index < terrain.biomes.length) {
    return terrain.biomes[index] as BiomeType
  }
  return BiomeType.DEEP_WATER
}

/**
 * Checks if a coordinate on the island terrain is sand (beach or shoreline).
 */
export function isTerrainSand(
  terrainOrX: IslandTerrain | number,
  xOrZ: number,
  zOrUndefined?: number,
): boolean {
  return sampleTerrainBiome(terrainOrX, xOrZ, zOrUndefined) === BiomeType.SAND_BEACH
}

/**
 * Checks if a coordinate on the island terrain is rock (steep cliffs, crags, or mountain peaks).
 */
export function isTerrainRock(
  terrainOrX: IslandTerrain | number,
  xOrZ: number,
  zOrUndefined?: number,
): boolean {
  const biome = sampleTerrainBiome(terrainOrX, xOrZ, zOrUndefined)
  return biome === BiomeType.ROCK_CLIFF || biome === BiomeType.SNOW_PEAK
}

/**
 * Checks if a coordinate on the island terrain is fertile open grassland.
 */
export function isTerrainGrass(
  terrainOrX: IslandTerrain | number,
  xOrZ: number,
  zOrUndefined?: number,
): boolean {
  return sampleTerrainBiome(terrainOrX, xOrZ, zOrUndefined) === BiomeType.FERTILE_GRASS
}

/**
 * Checks if a coordinate on the island terrain is dense forest soil.
 */
export function isTerrainForest(
  terrainOrX: IslandTerrain | number,
  xOrZ: number,
  zOrUndefined?: number,
): boolean {
  return sampleTerrainBiome(terrainOrX, xOrZ, zOrUndefined) === BiomeType.FOREST_SOIL
}



