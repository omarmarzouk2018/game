/**
 * @file RoadTextures.ts
 * Generates procedural PBR data texture atlases for historic, organic dirt roads.
 * Atlas layout (512x512 with 4 quadrants):
 * - Top-Left     [0.0..0.5, 0.0..0.5]: Straight road with parallel cart wheel ruts & gravel
 * - Top-Right    [0.5..1.0, 0.0..0.5]: Curved corner / bend with natural arced wheel ruts
 * - Bottom-Left  [0.0..0.5, 0.5..1.0]: T-Junction with flared corner fillets & merging tracks
 * - Bottom-Right [0.5..1.0, 0.5..1.0]: 4-Way Crossroad / circular clearing with multi-directional turns
 */

import * as THREE from 'three'
import { hash2D, fbmNoise2D } from '../island/terrain'

export interface RoadTextureSet {
  readonly diffuse: THREE.DataTexture
  readonly normal: THREE.DataTexture
  readonly roughness: THREE.DataTexture
}

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val))
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1)
  return t * t * (3 - 2 * t)
}

/**
 * Evaluates straight road cross-section profile.
 * normU in [0, 1] across straight road width.
 */
function getStraightProfile(normU: number): {
  rutDepth: number
  isCenterRidge: boolean
} {
  const rut1Dist = Math.abs(normU - 0.28)
  const rut2Dist = Math.abs(normU - 0.72)
  const rut1 = smoothstep(0.12, 0.0, rut1Dist)
  const rut2 = smoothstep(0.12, 0.0, rut2Dist)
  const rutDepth = Math.max(rut1, rut2)

  const centerDist = Math.abs(normU - 0.50)
  const isCenterRidge = smoothstep(0.14, 0.0, centerDist) * (1.0 - rutDepth) > 0.35

  return { rutDepth, isCenterRidge }
}

/**
 * Evaluates curved corner cross-section profile (turning North to East).
 * Center of turning curvature is at (1.0, 0.0).
 */
function getCornerProfile(normU: number, normV: number): {
  rutDepth: number
  isCenterRidge: boolean
  isCorner: boolean
} {
  const r = Math.hypot(1.0 - normU, normV) // Radius from inner corner (1, 0)
  const rut1Dist = Math.abs(r - 0.42)
  const rut2Dist = Math.abs(r - 0.76)
  const rut1 = smoothstep(0.13, 0.0, rut1Dist)
  const rut2 = smoothstep(0.13, 0.0, rut2Dist)
  const rutDepth = Math.max(rut1, rut2)

  const centerDist = Math.abs(r - 0.59)
  const isCenterRidge = smoothstep(0.12, 0.0, centerDist) * (1.0 - rutDepth) > 0.35
  const isCorner = r < 0.22 || r > 1.05

  return { rutDepth, isCenterRidge, isCorner }
}

/**
 * Evaluates 3-way T-junction profile (through road N-S at u=0.35, branch to East at v=0.5).
 */
function getTJunctionProfile(normU: number, normV: number): {
  rutDepth: number
  isCenterRidge: boolean
  wornDepth: number
} {
  // Through road ruts along N-S
  const throughRut1 = smoothstep(0.11, 0.0, Math.abs(normU - 0.20))
  const throughRut2 = smoothstep(0.11, 0.0, Math.abs(normU - 0.48))
  
  // Branch road ruts turning East
  const branchRut1 = smoothstep(0.11, 0.0, Math.abs(normV - 0.36)) * smoothstep(0.25, 0.55, normU)
  const branchRut2 = smoothstep(0.11, 0.0, Math.abs(normV - 0.64)) * smoothstep(0.25, 0.55, normU)

  const rutDepth = Math.max(throughRut1, throughRut2, branchRut1, branchRut2)
  const wornDist = Math.hypot(normU - 0.45, normV - 0.50)
  const wornDepth = smoothstep(0.40, 0.08, wornDist)
  const isCenterRidge = (1.0 - rutDepth) * wornDepth < 0.25 && normU < 0.35 && Math.abs(normV - 0.5) > 0.3

  return { rutDepth, isCenterRidge, wornDepth }
}

/**
 * Evaluates 4-way crossroad / circular junction profile.
 */
function getCrossroadProfile(normU: number, normV: number): {
  rutDepth: number
  wornDepth: number
  isCenter: boolean
} {
  const distFromCenter = Math.hypot(normU - 0.5, normV - 0.5) * 2.0 // 0 at center, ~1.4 at corners
  const wornDepth = smoothstep(0.90, 0.15, distFromCenter)

  // Radial turning wheel arc track marks
  const ringTrack = Math.sin(distFromCenter * Math.PI * 4.5) * 0.5 + 0.5
  const rutDepth = distFromCenter > 0.22 && distFromCenter < 0.82 ? ringTrack * 0.65 : 0.0
  const isCenter = distFromCenter < 0.25

  return { rutDepth, wornDepth, isCenter }
}

/**
 * Creates 512x512 procedural diffuse texture atlas for all road and junction variations.
 */
export function createDirtRoadDiffuseTexture(width = 512, height = 512): THREE.DataTexture {
  const data = new Uint8Array(width * height * 4)
  const halfWidth = width / 2
  const halfHeight = height / 2

  const rutDark = [64, 44, 28]        // Damp compacted loam
  const soilBase = [122, 92, 62]      // Rich warm earth
  const dustLight = [158, 130, 94]    // Powdery surface silt
  const pebbleColor = [175, 168, 155] // Embedded stones
  const mossTone = [92, 108, 56]      // Low-traffic weed sprout

  for (let y = 0; y < height; y++) {
    const isBottomHalf = y >= halfHeight
    const localY = isBottomHalf ? y - halfHeight : y
    const v = localY / halfHeight

    for (let x = 0; x < width; x++) {
      const isRightHalf = x >= halfWidth
      const localX = isRightHalf ? x - halfWidth : x
      const u = localX / halfWidth

      const idx = (y * width + x) * 4

      const microNoise = fbmNoise2D(x * 0.18, y * 0.18, 1337, 3)
      const macroNoise = fbmNoise2D(x * 0.04, y * 0.04, 4123, 2)
      const pebbleSeed = hash2D(x * 19, y * 19, 777)

      let r = soilBase[0] + macroNoise * 16 + microNoise * 10
      let g = soilBase[1] + macroNoise * 13 + microNoise * 8
      let b = soilBase[2] + macroNoise * 10 + microNoise * 6

      if (!isBottomHalf && !isRightHalf) {
        // Quadrant 0 (Top-Left): Straight road
        const profile = getStraightProfile(u)
        if (profile.rutDepth > 0) {
          const factor = profile.rutDepth * 0.82
          r = r * (1 - factor) + rutDark[0] * factor
          g = g * (1 - factor) + rutDark[1] * factor
          b = b * (1 - factor) + rutDark[2] * factor
        }
        if (profile.isCenterRidge) {
          const ridgeFactor = smoothstep(0.3, 0.9, 1.0 - Math.abs(u - 0.5) * 3)
          r = r * (1 - ridgeFactor * 0.35) + dustLight[0] * (ridgeFactor * 0.35)
          g = g * (1 - ridgeFactor * 0.35) + dustLight[1] * (ridgeFactor * 0.35)
          b = b * (1 - ridgeFactor * 0.35) + dustLight[2] * (ridgeFactor * 0.35)
          if (macroNoise > 0.42 && pebbleSeed > 0.25) {
            const mossBlend = (macroNoise - 0.42) * 1.4
            r = r * (1 - mossBlend) + mossTone[0] * mossBlend
            g = g * (1 - mossBlend) + mossTone[1] * mossBlend
            b = b * (1 - mossBlend) + mossTone[2] * mossBlend
          }
        }
      } else if (!isBottomHalf && isRightHalf) {
        // Quadrant 1 (Top-Right): Curved Corner / Bend
        const cProfile = getCornerProfile(u, v)
        if (cProfile.rutDepth > 0) {
          const factor = cProfile.rutDepth * 0.80
          r = r * (1 - factor) + rutDark[0] * factor
          g = g * (1 - factor) + rutDark[1] * factor
          b = b * (1 - factor) + rutDark[2] * factor
        }
        if (cProfile.isCenterRidge) {
          r = r * 0.75 + dustLight[0] * 0.25
          g = g * 0.75 + dustLight[1] * 0.25
          b = b * 0.75 + dustLight[2] * 0.25
        }
      } else if (isBottomHalf && !isRightHalf) {
        // Quadrant 2 (Bottom-Left): T-Junction
        const tProfile = getTJunctionProfile(u, v)
        const factor = Math.max(tProfile.rutDepth * 0.78, tProfile.wornDepth * 0.55)
        r = r * (1 - factor) + rutDark[0] * factor
        g = g * (1 - factor) + rutDark[1] * factor
        b = b * (1 - factor) + rutDark[2] * factor
      } else {
        // Quadrant 3 (Bottom-Right): 4-Way Crossroad
        const xProfile = getCrossroadProfile(u, v)
        const factor = Math.max(xProfile.rutDepth * 0.75, xProfile.wornDepth * 0.65)
        r = r * (1 - factor) + rutDark[0] * factor
        g = g * (1 - factor) + rutDark[1] * factor
        b = b * (1 - factor) + rutDark[2] * factor
      }

      // Small embedded gravel pebbles
      if (pebbleSeed > 0.92) {
        const pShade = clamp((pebbleSeed - 0.92) * 12, 0, 1)
        r = r * (1 - pShade) + pebbleColor[0] * pShade
        g = g * (1 - pShade) + pebbleColor[1] * pShade
        b = b * (1 - pShade) + pebbleColor[2] * pShade
      }

      data[idx] = clamp(Math.round(r), 0, 255)
      data[idx + 1] = clamp(Math.round(g), 0, 255)
      data[idx + 2] = clamp(Math.round(b), 0, 255)
      data[idx + 3] = 255
    }
  }

  const texture = new THREE.DataTexture(data, width, height, THREE.RGBAFormat, THREE.UnsignedByteType)
  texture.wrapS = THREE.ClampToEdgeWrapping
  texture.wrapT = THREE.ClampToEdgeWrapping
  texture.minFilter = THREE.LinearMipmapLinearFilter
  texture.magFilter = THREE.LinearFilter
  texture.generateMipmaps = true
  texture.needsUpdate = true
  return texture
}

/**
 * Creates 512x512 procedural normal map atlas.
 */
export function createDirtRoadNormalTexture(width = 512, height = 512): THREE.DataTexture {
  const data = new Uint8Array(width * height * 4)
  const halfWidth = width / 2
  const halfHeight = height / 2
  const heights = new Float32Array(width * height)

  for (let y = 0; y < height; y++) {
    const isBottomHalf = y >= halfHeight
    const localY = isBottomHalf ? y - halfHeight : y
    const v = localY / halfHeight

    for (let x = 0; x < width; x++) {
      const isRightHalf = x >= halfWidth
      const localX = isRightHalf ? x - halfWidth : x
      const u = localX / halfWidth

      let h = 0
      if (!isBottomHalf && !isRightHalf) {
        const profile = getStraightProfile(u)
        h = -profile.rutDepth * 0.35 + (profile.isCenterRidge ? 0.12 : 0)
      } else if (!isBottomHalf && isRightHalf) {
        const cProfile = getCornerProfile(u, v)
        h = -cProfile.rutDepth * 0.32 + (cProfile.isCenterRidge ? 0.10 : 0)
      } else if (isBottomHalf && !isRightHalf) {
        const tProfile = getTJunctionProfile(u, v)
        h = -tProfile.rutDepth * 0.30 - tProfile.wornDepth * 0.15
      } else {
        const xProfile = getCrossroadProfile(u, v)
        h = -xProfile.wornDepth * 0.28 - xProfile.rutDepth * 0.18
      }

      const noise = fbmNoise2D(x * 0.2, y * 0.2, 999, 2) * 0.08
      const pebble = hash2D(x * 19, y * 19, 777) > 0.92 ? 0.22 : 0
      heights[y * width + x] = h + noise + pebble
    }
  }

  for (let y = 0; y < height; y++) {
    const yPrev = (y - 1 + height) % height
    const yNext = (y + 1) % height
    for (let x = 0; x < width; x++) {
      const xPrev = (x - 1 + width) % width
      const xNext = (x + 1) % width

      const dz_dx = (heights[y * width + xNext] - heights[y * width + xPrev]) * 3.5
      const dz_dy = (heights[yNext * width + x] - heights[yPrev * width + x]) * 3.5

      const len = Math.hypot(dz_dx, dz_dy, 1.0)
      const nx = -dz_dx / len
      const ny = -dz_dy / len
      const nz = 1.0 / len

      const idx = (y * width + x) * 4
      data[idx] = clamp(Math.round((nx * 0.5 + 0.5) * 255), 0, 255)
      data[idx + 1] = clamp(Math.round((ny * 0.5 + 0.5) * 255), 0, 255)
      data[idx + 2] = clamp(Math.round((nz * 0.5 + 0.5) * 255), 0, 255)
      data[idx + 3] = 255
    }
  }

  const texture = new THREE.DataTexture(data, width, height, THREE.RGBAFormat, THREE.UnsignedByteType)
  texture.wrapS = THREE.ClampToEdgeWrapping
  texture.wrapT = THREE.ClampToEdgeWrapping
  texture.minFilter = THREE.LinearMipmapLinearFilter
  texture.magFilter = THREE.LinearFilter
  texture.generateMipmaps = true
  texture.needsUpdate = true
  return texture
}

/**
 * Creates 512x512 procedural roughness map atlas.
 */
export function createDirtRoadRoughnessTexture(width = 512, height = 512): THREE.DataTexture {
  const data = new Uint8Array(width * height * 4)
  const halfWidth = width / 2
  const halfHeight = height / 2

  for (let y = 0; y < height; y++) {
    const isBottomHalf = y >= halfHeight
    const localY = isBottomHalf ? y - halfHeight : y
    const v = localY / halfHeight

    for (let x = 0; x < width; x++) {
      const isRightHalf = x >= halfWidth
      const localX = isRightHalf ? x - halfWidth : x
      const u = localX / halfWidth
      const idx = (y * width + x) * 4

      let roughness = 0.90
      if (!isBottomHalf && !isRightHalf) {
        const profile = getStraightProfile(u)
        if (profile.rutDepth > 0) roughness -= profile.rutDepth * 0.22
      } else if (!isBottomHalf && isRightHalf) {
        const cProfile = getCornerProfile(u, v)
        if (cProfile.rutDepth > 0) roughness -= cProfile.rutDepth * 0.20
      } else if (isBottomHalf && !isRightHalf) {
        const tProfile = getTJunctionProfile(u, v)
        roughness -= tProfile.rutDepth * 0.20
      } else {
        const xProfile = getCrossroadProfile(u, v)
        roughness -= xProfile.wornDepth * 0.24
      }

      const pebbleSeed = hash2D(x * 19, y * 19, 777)
      if (pebbleSeed > 0.92) roughness = 0.58

      const val = clamp(Math.round(roughness * 255), 0, 255)
      data[idx] = val
      data[idx + 1] = val
      data[idx + 2] = val
      data[idx + 3] = 255
    }
  }

  const texture = new THREE.DataTexture(data, width, height, THREE.RGBAFormat, THREE.UnsignedByteType)
  texture.wrapS = THREE.ClampToEdgeWrapping
  texture.wrapT = THREE.ClampToEdgeWrapping
  texture.minFilter = THREE.LinearMipmapLinearFilter
  texture.magFilter = THREE.LinearFilter
  texture.generateMipmaps = true
  texture.needsUpdate = true
  return texture
}

/**
 * Builds the complete unified procedural texture set for dirt roads.
 */
export function createDirtRoadTextureSet(): RoadTextureSet {
  return {
    diffuse: createDirtRoadDiffuseTexture(512, 512),
    normal: createDirtRoadNormalTexture(512, 512),
    roughness: createDirtRoadRoughnessTexture(512, 512),
  }
}
