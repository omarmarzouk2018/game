import { describe, expect, it } from 'vitest'
import { createIslandTerrain, sampleIslandTerrain } from './terrain'
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
    expect(sample(0.42, 0).height).toBeGreaterThan(0.03)
    expect(sample(0, 0.4).height).toBeGreaterThan(0.03)
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
    expect(centralMean).toBeLessThan(1.5)
    expect(rearMean).toBeLessThan(2.5)
  })

  it('keeps gentle rolling relief across the whole island without towering peaks', () => {
    const interior = [-0.25, -0.12, 0, 0.12, 0.25].flatMap((x) =>
      [-0.25, -0.12, 0, 0.12, 0.25].map((z) => sample(x, z).height),
    )
    const maximumHeight = Math.max(...terrain.heights)
    const minimumInteriorHeight = Math.min(...interior)
    const maximumInteriorHeight = Math.max(...interior)

    expect(maximumHeight).toBeLessThan(6)
    expect(maximumInteriorHeight - minimumInteriorHeight).toBeGreaterThan(0.35)
    expect(maximumInteriorHeight - minimumInteriorHeight).toBeLessThan(3.5)
    expect(interior.every((height) => height > 0)).toBe(true)
  })

  it('slopes the shoreline continuously below sea level', () => {
    const inland = sample(0.4, 0).height
    const shore = sample(0.46, 0).height
    const underwater = sample(0.49, 0).height

    expect(inland).toBeGreaterThan(0.1)
    expect(shore).toBeLessThan(inland)
    expect(underwater).toBeLessThan(-0.1)
  })
})
