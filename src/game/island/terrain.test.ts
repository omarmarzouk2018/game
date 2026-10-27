import { describe, expect, it } from 'vitest'
import { createIslandTerrain, isBuildable, sampleIslandTerrain } from './terrain'
import { createTreePlacements } from './IslandScene'

// Coordinates are normalized from the island's centered world bounds:
// x and z each run from -0.5 to 0.5, with +z toward the rear ridge.
const seed = 41723
const segments = 128
const terrain = createIslandTerrain(seed, segments)

function sample(u: number, v: number) {
  return sampleIslandTerrain(terrain, u * terrain.width, v * terrain.depth)
}

describe('island terrain', () => {
  it('generates identical arrays for the same seed and resolution', () => {
    const repeat = createIslandTerrain(seed, segments)
    expect(repeat.heights).toEqual(terrain.heights)
    expect(repeat.landMask).toEqual(terrain.landMask)
  })

  it('uses expanded world bounds while preserving normalized island coverage', () => {
    expect(terrain.width).toBeGreaterThan(180)
    expect(terrain.depth).toBeGreaterThan(180)
    expect(sample(-0.3, 0).land).toBe(true)
    expect(sample(0.3, 0).land).toBe(true)
    const coverage = terrain.landMask.reduce((count, land) => count + land, 0) / terrain.landMask.length
    expect(coverage).toBeGreaterThan(0.5)
    expect(sample(0.42, 0).height).toBeGreaterThan(1)
    expect(sample(0, 0.4).height).toBeGreaterThan(1)
  })

  it('keeps most sampled interior locations above sea level', () => {
    const points = Array.from({ length: 81 }, (_, index) => {
      const x = ((index % 9) - 4) * 0.075
      const z = (Math.floor(index / 9) - 4) * 0.075
      return sample(x, z)
    })
    expect(points.filter((point) => point.land).length).toBeGreaterThanOrEqual(72)
  })

  it('slopes the island perimeter down to sea level', () => {
    const shore = [sample(-0.49, 0), sample(0.49, 0), sample(0, -0.49), sample(0, 0.49), sample(-0.5, 0), sample(0.5, 0), sample(0, -0.5), sample(0, 0.5)]
    expect(shore.every((point) => !point.land)).toBe(true)
    expect(shore.every((point) => point.height < 0.03)).toBe(true)
  })

  it('cuts a broad water harbor into the western coast', () => {
    const bay = [sample(-0.34, -0.13), sample(-0.34, 0), sample(-0.34, 0.13)]
    const nearbyCoast = [sample(-0.27, -0.13), sample(-0.27, 0), sample(-0.27, 0.13)]
    expect(bay.every((point) => !point.land)).toBe(true)
    expect(nearbyCoast.filter((point) => point.land).length).toBeGreaterThanOrEqual(2)
  })

  it('places deterministic dense tree clusters away from the central plain and harbor', () => {
    const placements = createTreePlacements(terrain)
    expect(placements).toEqual(createTreePlacements(terrain))
    expect(placements.length).toBeGreaterThan(70)
    expect(placements.every(([x, z]) => Math.abs(x) >= 12 || z >= 22)).toBe(true)
    expect(placements.every(([x, z]) => sampleIslandTerrain(terrain, x, z).land)).toBe(true)
    expect(placements.some(([x, z]) => x < -terrain.width * 0.25 && Math.abs(z) < terrain.depth * 0.13)).toBe(false)
  })

  it('keeps the central buildable ground and rear landform low', () => {
    const centralMean = [-0.1, 0, 0.1].flatMap((x) => [-0.1, 0, 0.1].map((z) => sample(x, z).height))
      .reduce((sum, height) => sum + height, 0) / 9
    const rearMean = [-0.1, 0, 0.1].flatMap((x) => [0.3, 0.37, 0.44].map((z) => sample(x, z).height))
      .reduce((sum, height) => sum + height, 0) / 9
    expect(centralMean).toBeGreaterThan(2)
    expect(centralMean).toBeLessThan(12)
    expect(rearMean).toBeGreaterThan(3)
    expect(rearMean).toBeLessThan(18)
  })

  it('keeps sea level at zero and the interior land above one with natural variation', () => {
    const interior = [-0.2, -0.1, 0, 0.1, 0.2].flatMap((x) =>
      [-0.2, -0.1, 0, 0.1, 0.2].map((z) => sample(x, z).height),
    )

    expect(sample(0, 0).height).toBeGreaterThan(1.5)
    expect(Math.min(...interior)).toBeGreaterThan(1.5)
    expect(Math.max(...interior) - Math.min(...interior)).toBeGreaterThan(0.5)
    expect(sample(0.5, 0).height).toBeLessThan(0)
  })

  it('raises a rugged rear ridge above the low buildable plain', () => {
    const rearRockyRise = sample(0.12, 0.215).height
    const centralPlain = [-0.1, 0, 0.1].map((x) => sample(x, 0).height)

    expect(rearRockyRise).toBeGreaterThan(12)
    expect(Math.max(...centralPlain)).toBeLessThan(rearRockyRise)
  })

  it('shapes prominent mountain peaks and varied interior relief', () => {
    const interior = [-0.2, -0.1, 0, 0.1, 0.2].flatMap((x) =>
      [-0.1, 0, 0.1].map((z) => sample(x, z).height),
    )
    const maximumHeight = Math.max(...terrain.heights)
    const minimumInteriorHeight = Math.min(...interior)
    const maximumInteriorHeight = Math.max(...interior)

    expect(maximumHeight).toBeGreaterThanOrEqual(52)
    expect(maximumHeight).toBeLessThanOrEqual(60)
    expect(maximumInteriorHeight - minimumInteriorHeight).toBeGreaterThan(1)
    expect(interior.every((height) => height > 1.5)).toBe(true)
  })

  it('makes most of the coast rocky and steep while preserving gentler shore sections', () => {
    const eastCoastProfiles = [-0.3, -0.15, 0, 0.15, 0.3].map((z) => ({
      inland: sample(0.4, z).height,
      nearShore: sample(0.46, z).height,
      offshore: sample(0.49, z).height,
    }))
    const steepSections = eastCoastProfiles.filter(({ inland, nearShore, offshore }) =>
      inland - offshore > 1.5 && nearShore < inland - 0.3,
    )
    const gentlerHarborShore = sample(-0.3, 0).height

    expect(steepSections.length).toBeGreaterThanOrEqual(3)
    expect(gentlerHarborShore).toBeGreaterThan(-3.0)
    expect(sample(0.49, 0).height).toBeLessThan(0)
    expect(sample(0.5, 0).height).toBeLessThan(-3)
  })

  it('slopes the shoreline continuously below sea level', () => {
    const inland = sample(0.4, 0).height
    const shore = sample(0.46, 0).height
    const underwater = sample(0.49, 0).height

    expect(inland).toBeGreaterThan(1)
    expect(shore).toBeLessThan(inland)
    expect(underwater).toBeLessThan(0)
  })

  describe('Phase 2: real mountains and buildability', () => {
    it('exports isBuildable and identifies valid building ground', () => {
      // Central plain near (0, 0) should be buildable (height 1.2-8, gentle slope < 15°)
      expect(isBuildable(terrain, 0, 0)).toBe(true)
      // When called without terrain, supports ambient (x, z) coordinates
      expect(isBuildable(0, 0)).toBe(true)

      // Ocean / deep water must not be buildable
      expect(isBuildable(terrain, -terrain.width * 0.49, 0)).toBe(false)
      expect(isBuildable(-terrain.width * 0.49, 0)).toBe(false)

      // Mountain ridge peak (> 8 height) must not be buildable
      const peakSample = sample(0.12, 0.215)
      expect(isBuildable(terrain, peakSample.x, peakSample.z)).toBe(false)
    })

    it('rejects steep terrain slopes >= 15 degrees from being buildable', () => {
      // On steep cliff areas, isBuildable must return false
      // Find a steep cell or test a known steep region
      let foundSteepAndTested = false
      for (let x = -50; x <= 50; x += 10) {
        for (let z = 20; z <= 60; z += 5) {
          const s = sampleIslandTerrain(terrain, x, z)
          if (s.land) {
            const right = sampleIslandTerrain(terrain, x + 2, z).height
            const left = sampleIslandTerrain(terrain, x - 2, z).height
            const front = sampleIslandTerrain(terrain, x, z + 2).height
            const back = sampleIslandTerrain(terrain, x, z - 2).height
            const slopeDeg = Math.atan(Math.hypot((right - left) / 4, (front - back) / 4)) * (180 / Math.PI)
            if (slopeDeg >= 15) {
              expect(isBuildable(terrain, x, z)).toBe(false)
              foundSteepAndTested = true
              break
            }
          }
        }
        if (foundSteepAndTested) break
      }
      expect(foundSteepAndTested).toBe(true)
    })

    it('forms sharp ridged mountain peaks about four times a tree tall', () => {
      const maxHeight = Math.max(...terrain.heights)
      expect(maxHeight).toBeGreaterThanOrEqual(52)
      expect(maxHeight).toBeLessThanOrEqual(60)
    })

    it('features foothills between heights 5 and 10 with moderate slopes', () => {
      let foothillCount = 0
      for (let i = 0; i < terrain.heights.length; i += 1) {
        const h = terrain.heights[i]
        if (h >= 5 && h <= 10) foothillCount += 1
      }
      // Foothills should form a meaningful transition zone (at least 5% of all cells)
      const foothillPercent = (foothillCount / terrain.heights.length) * 100
      expect(foothillPercent).toBeGreaterThan(5)
    })
  })
})

