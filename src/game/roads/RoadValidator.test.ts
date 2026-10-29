import { describe, it, expect } from 'vitest'
import { createIslandTerrain, type IslandTerrain } from '../island/terrain'
import { EconomyManager } from '../economy/EconomyManager'
import { RoadNetwork } from './RoadNetwork'
import { RoadValidator } from './RoadValidator'

describe('RoadValidator', () => {
  const terrain: IslandTerrain = createIslandTerrain(41723)
  const validator = new RoadValidator()

  it('validates buildable plains coordinates successfully', () => {
    // Coordinate near center plains
    const { gridX, gridZ } = RoadNetwork.worldToGrid(0, 0)
    const result = validator.validateTile(terrain, gridX, gridZ)

    expect(result.isValid).toBe(true)
    expect(result.height).toBeGreaterThan(0.4)
  })

  it('rejects underwater / sea coordinates', () => {
    // Coordinate far off in ocean
    const { gridX, gridZ } = RoadNetwork.worldToGrid(-200, -200)
    const result = validator.validateTile(terrain, gridX, gridZ)

    expect(result.isValid).toBe(false)
    expect(result.reason).toContain('المياه')
  })

  it('rejects coordinates outside the island limits', () => {
    const { gridX, gridZ } = RoadNetwork.worldToGrid(300, 300)
    const result = validator.validateTile(terrain, gridX, gridZ)

    expect(result.isValid).toBe(false)
    expect(result.reason).toContain('خارج حدود')
  })

  it('validates whole path and calculates cost correctly for new tiles', () => {
    const roadNetwork = new RoadNetwork()
    const economy = new EconomyManager(100)

    const path = [
      RoadNetwork.worldToGrid(0, 0),
      RoadNetwork.worldToGrid(2, 0),
      RoadNetwork.worldToGrid(4, 0),
    ]

    const result = validator.validatePath(terrain, roadNetwork, economy, path, 'dirt')
    expect(result.isValid).toBe(true)
    expect(result.newTileCount).toBe(3)
    expect(result.totalCost).toBe(15) // 3 * 5 = 15
  })

  it('does not charge for existing road tiles along the path', () => {
    const roadNetwork = new RoadNetwork()
    const economy = new EconomyManager(100)

    const t0 = RoadNetwork.worldToGrid(0, 0)
    const t1 = RoadNetwork.worldToGrid(2, 0)
    const t2 = RoadNetwork.worldToGrid(4, 0)

    // Pre-build t0
    roadNetwork.addTile({
      key: `${t0.gridX},${t0.gridZ}`,
      gridX: t0.gridX,
      gridZ: t0.gridZ,
      roadType: 'dirt',
      height: 2.0,
    })

    const path = [t0, t1, t2]
    const result = validator.validatePath(terrain, roadNetwork, economy, path, 'dirt')

    expect(result.isValid).toBe(true)
    expect(result.newTileCount).toBe(2)
    expect(result.totalCost).toBe(10) // 2 new tiles * 5 = 10
  })

  it('rejects path when player cannot afford the cost', () => {
    const roadNetwork = new RoadNetwork()
    const economy = new EconomyManager(5) // Only 5 gold

    const path = [
      RoadNetwork.worldToGrid(0, 0),
      RoadNetwork.worldToGrid(2, 0),
      RoadNetwork.worldToGrid(4, 0),
    ] // Needs 15 gold

    const result = validator.validatePath(terrain, roadNetwork, economy, path, 'dirt')
    expect(result.isValid).toBe(false)
    expect(result.reason).toContain('غير كافٍ')
  })
})
