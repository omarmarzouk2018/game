import { describe, expect, it } from 'vitest'
import { createIslandTerrain, sampleIslandTerrain } from './terrain'

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

  it('keeps most sampled interior locations above sea level', () => {
    const points = Array.from({ length: 81 }, (_, index) => {
      const x = ((index % 9) - 4) * 0.075
      const z = (Math.floor(index / 9) - 4) * 0.075
      return sample(x, z)
    })
    expect(points.filter((point) => point.land).length).toBeGreaterThanOrEqual(72)
  })

  it('slopes the island perimeter down to sea level', () => {
    const shore = [sample(-0.49, 0), sample(0.49, 0), sample(0, -0.49), sample(0, 0.49)]
    expect(shore.every((point) => !point.land)).toBe(true)
    expect(shore.every((point) => point.height < 0.03)).toBe(true)
  })

  it('cuts a broad water harbor into the western coast', () => {
    const bay = [sample(-0.34, -0.13), sample(-0.34, 0), sample(-0.34, 0.13)]
    const nearbyCoast = [sample(-0.27, -0.13), sample(-0.27, 0), sample(-0.27, 0.13)]
    expect(bay.every((point) => !point.land)).toBe(true)
    expect(nearbyCoast.filter((point) => point.land).length).toBeGreaterThanOrEqual(2)
  })

  it('keeps the central buildable lowland lower than the rear ridge', () => {
    const centralMean = [-0.1, 0, 0.1].flatMap((x) => [-0.1, 0, 0.1].map((z) => sample(x, z).height))
      .reduce((sum, height) => sum + height, 0) / 9
    const ridgeMean = [-0.1, 0, 0.1].flatMap((x) => [0.3, 0.37, 0.44].map((z) => sample(x, z).height))
      .reduce((sum, height) => sum + height, 0) / 9
    expect(ridgeMean - centralMean).toBeGreaterThan(0.2)
  })

  it('raises at least two rear highland peaks above the plains', () => {
    const plains = sample(0, 0).height
    const peaks = [sample(-0.22, 0.34).height, sample(0.22, 0.34).height]
    expect(peaks.filter((height) => height > plains + 0.35).length).toBeGreaterThanOrEqual(2)
  })
})
