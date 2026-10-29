import * as THREE from 'three'
import { valueNoise2D } from './terrain'

/**
 * Biome color palette representing natural coastal, grassland, forest, and mountain environments.
 */
export const TERRAIN_PALETTE = {
  deepSeabed: new THREE.Color(0x26555b),
  shallowSeabed: new THREE.Color(0x558f88),
  wetSand: new THREE.Color(0xcbb06d),
  beach: new THREE.Color(0xdec078),
  coastalGrass: new THREE.Color(0x6e8a44),
  baseGrass: new THREE.Color(0x4a7c34),
  lushMeadow: new THREE.Color(0x387327),
  warmMeadow: new THREE.Color(0x5e8c33),
  dryGrass: new THREE.Color(0x758542),
  loamDirt: new THREE.Color(0x61523a),
  highland: new THREE.Color(0x5d7348),
  mossRock: new THREE.Color(0x59684f),
  rock: new THREE.Color(0x6b6e6b),
  darkRock: new THREE.Color(0x505352),
  snow: new THREE.Color(0xc8d0d4),
} as const

/**
 * Options required to determine a vertex's natural biome color.
 */
export type TerrainColorOptions = {
  height: number
  slopeDeg: number
  worldX: number
  worldZ: number
  snowStart: number
  snowFull: number
}

/**
 * Computes a rich, naturally graded biome color for a terrain vertex based on
 * elevation, slope, and multi-octave 2D spatial noise (meadows, loam dirt, highlands).
 */
export function computeTerrainVertexColor(options: TerrainColorOptions): THREE.Color {
  const { height, slopeDeg, worldX, worldZ, snowStart, snowFull } = options

  // 1. Underwater and seabed transitions
  if (height < -2.0) {
    const factor = THREE.MathUtils.smoothstep(height, -5.8, -2.0)
    return TERRAIN_PALETTE.deepSeabed.clone().lerp(TERRAIN_PALETTE.shallowSeabed, factor)
  }

  if (height < -0.3) {
    const factor = THREE.MathUtils.clamp((height + 2.0) / 1.7, 0, 1)
    return TERRAIN_PALETTE.shallowSeabed.clone().lerp(TERRAIN_PALETTE.wetSand, factor)
  }

  // 2. Shoreline and beach sands
  if (height < 0.3) {
    const factor = THREE.MathUtils.clamp((height + 0.3) / 0.6, 0, 1)
    return TERRAIN_PALETTE.wetSand.clone().lerp(TERRAIN_PALETTE.beach, factor)
  }

  if (height < 1.6) {
    return TERRAIN_PALETTE.beach.clone()
  }

  // 3. Beach-to-grass coastal transition (1.6m - 2.8m)
  const coastalBlend = THREE.MathUtils.smoothstep(height, 1.6, 2.8)

  // 4. Spatial noise for organic grasslands and meadows
  // Low-frequency noise creates large contiguous biome patches (lush vs sunny meadow)
  const macroNoise = valueNoise2D(worldX * 0.028, worldZ * 0.028, 9182)
  // Mid-frequency noise adds patches of organic soil/dirt and dry grass
  const soilNoise = valueNoise2D(worldX * 0.065, worldZ * 0.065, 3411)
  // High-frequency subtle noise prevents artificial flat banding
  const microJitter = valueNoise2D(worldX * 0.16, worldZ * 0.16, 5623) * 0.06

  // Base grass color synthesized from lush, warm, and standard green biomes
  const grasslandColor = TERRAIN_PALETTE.baseGrass.clone()
  if (macroNoise > 0.15) {
    // Sun-exposed warmer meadow
    const factor = Math.min(0.8, (macroNoise - 0.15) * 1.5)
    grasslandColor.lerp(TERRAIN_PALETTE.warmMeadow, factor)
  } else if (macroNoise < -0.15) {
    // Richer, fertile lowland grass
    const factor = Math.min(0.75, (-macroNoise - 0.15) * 1.5)
    grasslandColor.lerp(TERRAIN_PALETTE.lushMeadow, factor)
  }

  // Integrate subtle loam dirt and dry patches in moderate concentrations
  if (soilNoise > 0.42 && height > 2.2 && height < 12.0) {
    const dirtFactor = Math.min(0.45, (soilNoise - 0.42) * 1.3)
    grasslandColor.lerp(TERRAIN_PALETTE.loamDirt, dirtFactor)
  } else if (soilNoise < -0.45 && height > 3.0) {
    const dryFactor = Math.min(0.4, (-soilNoise - 0.45) * 1.2)
    grasslandColor.lerp(TERRAIN_PALETTE.dryGrass, dryFactor)
  }

  // Intermediate incline (12° - 24°) introduces subtle dirt and dry grass wear
  if (slopeDeg > 12 && slopeDeg <= 24 && height > 2.5) {
    const inclineFactor = (slopeDeg - 12) / 12
    grasslandColor.lerp(TERRAIN_PALETTE.dryGrass, inclineFactor * 0.35)
  }

  let color: THREE.Color
  if (height < 2.8) {
    color = TERRAIN_PALETTE.beach.clone().lerp(grasslandColor, coastalBlend)
  } else if (height < 6.0) {
    // Transition from lowlands to highlands
    const highlandFactor = (height - 2.8) / 3.2
    const highlandBiome = TERRAIN_PALETTE.highland.clone()
    if (macroNoise > 0.2) {
      highlandBiome.lerp(TERRAIN_PALETTE.mossRock, (macroNoise - 0.2) * 0.5)
    }
    color = grasslandColor.lerp(highlandBiome, highlandFactor)
  } else if (height < 14.0) {
    // Transition from highlands to rocky mountain bases
    const rockFactor = (height - 6.0) / 8.0
    const transitionRock = TERRAIN_PALETTE.rock.clone()
    if (macroNoise < -0.1) {
      transitionRock.lerp(TERRAIN_PALETTE.mossRock, 0.35)
    }
    color = TERRAIN_PALETTE.highland.clone().lerp(transitionRock, rockFactor)
  } else if (height < snowStart) {
    color = TERRAIN_PALETTE.rock.clone()
    if (slopeDeg > 35) {
      color.lerp(TERRAIN_PALETTE.darkRock, 0.3)
    }
  } else {
    // Alpine snow cap transition
    const snowFactor = Math.min(1, (height - snowStart) / Math.max(0.1, snowFull - snowStart))
    color = TERRAIN_PALETTE.rock.clone().lerp(TERRAIN_PALETTE.snow, snowFactor)
  }

  // Steep cliff rock shading on mountain crags (only above sea/beach level)
  if (slopeDeg > 24 && height > 3.2) {
    const cliffFactor = Math.min(0.95, (slopeDeg - 24) / 18)
    const targetRock = slopeDeg > 38 ? TERRAIN_PALETTE.darkRock : TERRAIN_PALETTE.rock
    color.lerp(targetRock, cliffFactor)
  }

  // Micro-variation jitter to eliminate flat polygonal banding across large fields
  if (height >= 1.6 && height < snowStart) {
    color.r = THREE.MathUtils.clamp(color.r + microJitter, 0, 1)
    color.g = THREE.MathUtils.clamp(color.g + microJitter, 0, 1)
    color.b = THREE.MathUtils.clamp(color.b + microJitter, 0, 1)
  }

  return color
}
