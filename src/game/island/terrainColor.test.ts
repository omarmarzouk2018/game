import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { computeTerrainVertexColor, TERRAIN_PALETTE } from './terrainColor'

describe('terrainColor biome shading', () => {
  const snowStart = 35
  const snowFull = 45

  it('interpolates seabed colors correctly for deep underwater elevations', () => {
    const deepColor = computeTerrainVertexColor({
      height: -5.0,
      slopeDeg: 0,
      worldX: 0,
      worldZ: 0,
      snowStart,
      snowFull,
    })
    expect(deepColor.r).toBeCloseTo(TERRAIN_PALETTE.deepSeabed.r, 1)

    const shallowColor = computeTerrainVertexColor({
      height: -1.0,
      slopeDeg: 0,
      worldX: 0,
      worldZ: 0,
      snowStart,
      snowFull,
    })
    expect(shallowColor.g).toBeGreaterThan(0.3)
  })

  it('renders beach and sand along shorelines (height 0.2m - 1.5m)', () => {
    const beachColor = computeTerrainVertexColor({
      height: 1.0,
      slopeDeg: 2,
      worldX: 20,
      worldZ: -10,
      snowStart,
      snowFull,
    })
    const sandReference = new THREE.Color(0xd4b886)
    const distance = Math.hypot(
      beachColor.r - sandReference.r,
      beachColor.g - sandReference.g,
      beachColor.b - sandReference.b,
    )
    expect(distance).toBeLessThan(0.25)
  })

  it('creates varied natural grass shades (lush, warm meadow, loam dirt) across different world positions', () => {
    // Sample multiple coordinates at standard low grassland elevation (height = 3.5m)
    const samples: THREE.Color[] = []
    for (let x = -80; x <= 80; x += 40) {
      for (let z = -80; z <= 80; z += 40) {
        samples.push(
          computeTerrainVertexColor({
            height: 3.5,
            slopeDeg: 4,
            worldX: x,
            worldZ: z,
            snowStart,
            snowFull,
          }),
        )
      }
    }

    // Verify colors are all distinct rather than a single uniform green
    const uniqueColors = new Set(samples.map((c) => `${c.r.toFixed(3)},${c.g.toFixed(3)},${c.b.toFixed(3)}`))
    expect(uniqueColors.size).toBeGreaterThan(5)

    // Ensure they maintain a natural green dominance (g > b)
    for (const color of samples) {
      expect(color.g).toBeGreaterThan(color.b)
    }
  })

  it('shifts towards rock on steep slopes exceeding 24 degrees', () => {
    const flatColor = computeTerrainVertexColor({
      height: 5.0,
      slopeDeg: 5,
      worldX: 0,
      worldZ: 0,
      snowStart,
      snowFull,
    })

    const cliffColor = computeTerrainVertexColor({
      height: 5.0,
      slopeDeg: 38,
      worldX: 0,
      worldZ: 0,
      snowStart,
      snowFull,
    })

    // Cliff should be more desaturated and gray (closer to rock 0x6b6e6b)
    expect(Math.abs(cliffColor.r - cliffColor.g)).toBeLessThan(Math.abs(flatColor.r - flatColor.g))
  })

  it('renders mountain peaks with snow caps at high elevations', () => {
    const peakColor = computeTerrainVertexColor({
      height: 44,
      slopeDeg: 15,
      worldX: 0,
      worldZ: 0,
      snowStart,
      snowFull,
    })
    const snowReference = TERRAIN_PALETTE.snow
    const distance = Math.hypot(
      peakColor.r - snowReference.r,
      peakColor.g - snowReference.g,
      peakColor.b - snowReference.b,
    )
    expect(distance).toBeLessThan(0.25)
  })
})
