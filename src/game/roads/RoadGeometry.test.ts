import { describe, it, expect } from 'vitest'
import {
  getRoadTileTopology,
  calculateVertexAlpha,
  getRoadProfileElevation,
  computeRoadVertexUV,
  buildRoadsGeometry,
  type TileNeighbors,
} from './RoadGeometry'
import { createIslandTerrain } from '../island/terrain'

describe('RoadGeometry topology and seamless junction system', () => {
  const terrain = createIslandTerrain(41723)

  it('correctly classifies all 6 junction topologies and orientations', () => {
    // 1. Isolated
    const isolatedNeighbors: TileNeighbors = { hasNorth: false, hasSouth: false, hasEast: false, hasWest: false }
    expect(getRoadTileTopology(isolatedNeighbors).junctionType).toBe('isolated')

    // 2. Dead-End (e.g. North)
    const deadEndN: TileNeighbors = { hasNorth: true, hasSouth: false, hasEast: false, hasWest: false }
    expect(getRoadTileTopology(deadEndN).junctionType).toBe('dead_end')
    expect(getRoadTileTopology(deadEndN).rotation).toBe(0)

    // 3. Straight (North-South vs East-West)
    const straightNS: TileNeighbors = { hasNorth: true, hasSouth: true, hasEast: false, hasWest: false }
    expect(getRoadTileTopology(straightNS).junctionType).toBe('straight')
    expect(getRoadTileTopology(straightNS).orientation).toBe('along-z')

    const straightEW: TileNeighbors = { hasNorth: false, hasSouth: false, hasEast: true, hasWest: true }
    expect(getRoadTileTopology(straightEW).junctionType).toBe('straight')
    expect(getRoadTileTopology(straightEW).orientation).toBe('along-x')

    // 4. Corner (North + East)
    const cornerNE: TileNeighbors = { hasNorth: true, hasSouth: false, hasEast: true, hasWest: false }
    expect(getRoadTileTopology(cornerNE).junctionType).toBe('corner')
    expect(getRoadTileTopology(cornerNE).rotation).toBe(0)

    // 5. T-Junction (North + East + South)
    const tBranchE: TileNeighbors = { hasNorth: true, hasSouth: true, hasEast: true, hasWest: false }
    expect(getRoadTileTopology(tBranchE).junctionType).toBe('t_junction')
    expect(getRoadTileTopology(tBranchE).rotation).toBe(0)

    // 6. Crossroad (4-Way)
    const crossroad: TileNeighbors = { hasNorth: true, hasSouth: true, hasEast: true, hasWest: true }
    expect(getRoadTileTopology(crossroad).junctionType).toBe('crossroad')
  })

  it('calculates full alpha at open connection boundaries and fillets inner junction corners', () => {
    const tNeighbors: TileNeighbors = { hasNorth: true, hasSouth: true, hasEast: true, hasWest: false }

    // Center of tile has full opacity
    const alphaCenter = calculateVertexAlpha(0.5, 0.5, tNeighbors)
    expect(alphaCenter).toBe(1.0)

    // East boundary connecting to East neighbor has full opacity (fracX = 1.0, fracZ = 0.5)
    const alphaEast = calculateVertexAlpha(1.0, 0.5, tNeighbors)
    expect(alphaEast).toBe(1.0)

    // North boundary connecting to North neighbor has full opacity (fracX = 0.5, fracZ = 0.0)
    const alphaNorth = calculateVertexAlpha(0.5, 0.0, tNeighbors)
    expect(alphaNorth).toBe(1.0)

    // Inner fillet corner between North and East arms (fracX = 0.6, fracZ = 0.4) is solidly filled
    const alphaFillet = calculateVertexAlpha(0.6, 0.4, tNeighbors)
    expect(alphaFillet).toBe(1.0)

    // West shoulder (no West neighbor) fades out smoothly
    const alphaWestEdge = calculateVertexAlpha(0.0, 0.5, tNeighbors)
    expect(alphaWestEdge).toBeLessThan(0.2)
  })

  it('evaluates 3D crowned cross-section with depressed ruts and raised crown ridge', () => {
    const straightTopology = getRoadTileTopology({
      hasNorth: true,
      hasSouth: true,
      hasEast: false,
      hasWest: false,
    })

    // Center crown ridge (fracX = 0.5, fracZ = 0.5) is raised above 0
    const centerElevation = getRoadProfileElevation(0.5, 0.5, straightTopology)
    expect(centerElevation).toBeGreaterThan(0.01)

    // Wheel rut track (fracX = 0.5 - 0.22 = 0.28) is depressed below 0
    const rutElevation = getRoadProfileElevation(0.28, 0.5, straightTopology)
    expect(rutElevation).toBeLessThan(-0.02)
  })

  it('maps UV coordinates accurately into the 4 atlas quadrants', () => {
    const straight = getRoadTileTopology({ hasNorth: true, hasSouth: true, hasEast: false, hasWest: false })
    const [uS, vS] = computeRoadVertexUV(0.5, 0.5, straight)
    expect(uS).toBeLessThanOrEqual(0.5)
    expect(vS).toBeLessThanOrEqual(0.5)

    const corner = getRoadTileTopology({ hasNorth: true, hasSouth: false, hasEast: true, hasWest: false })
    const [uC, vC] = computeRoadVertexUV(0.5, 0.5, corner)
    expect(uC).toBeGreaterThanOrEqual(0.5)
    expect(vC).toBeLessThanOrEqual(0.5)

    const tJunc = getRoadTileTopology({ hasNorth: true, hasSouth: true, hasEast: true, hasWest: false })
    const [uT, vT] = computeRoadVertexUV(0.5, 0.5, tJunc)
    expect(uT).toBeLessThanOrEqual(0.5)
    expect(vT).toBeGreaterThanOrEqual(0.5)

    const cross = getRoadTileTopology({ hasNorth: true, hasSouth: true, hasEast: true, hasWest: true })
    const [uX, vX] = computeRoadVertexUV(0.5, 0.5, cross)
    expect(uX).toBeGreaterThanOrEqual(0.5)
    expect(vX).toBeGreaterThanOrEqual(0.5)
  })

  it('buildRoadsGeometry generates non-empty buffer attributes with 25 vertices per tile', () => {
    const geo = buildRoadsGeometry(terrain, [
      { gridX: 0, gridZ: 0 },
    ])
    expect(geo.attributes.position.count).toBe(25)
    expect(geo.attributes.uv.count).toBe(25)
    expect(geo.attributes.alpha.count).toBe(25)
  })
})
