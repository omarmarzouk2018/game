import { describe, expect, it } from 'vitest'
import { createIslandTerrain } from '../island/terrain'
import { RoadNetwork } from '../roads/RoadNetwork'
import { BuildingManager } from './BuildingManager'
import { BuildingValidator } from './BuildingValidator'
import { BUILDING_DEFINITIONS } from './BuildingTypes'

describe('BuildingValidator', () => {
  const terrain = createIslandTerrain(41723)
  const validator = new BuildingValidator()
  const def = BUILDING_DEFINITIONS.pioneer_cottage // 3x3, gold: 10

  it('validates successful placement on flat habitable land with sufficient gold', () => {
    const buildingManager = new BuildingManager()
    const roadNetwork = new RoadNetwork()

    const result = validator.validateBuilding(terrain, buildingManager, roadNetwork, def, 0, 0, 100)
    expect(result.isValid).toBe(true)
    expect(result.canAfford).toBe(true)
    expect(result.occupiedTiles.length).toBe(9)
  })

  it('rejects placement when gold is insufficient', () => {
    const buildingManager = new BuildingManager()
    const roadNetwork = new RoadNetwork()

    const result = validator.validateBuilding(terrain, buildingManager, roadNetwork, def, 0, 0, 5)
    expect(result.isValid).toBe(false)
    expect(result.canAfford).toBe(false)
    expect(result.reason).toMatch(/الذهب غير كافٍ/)
  })

  it('rejects placement outside island bounds', () => {
    const buildingManager = new BuildingManager()
    const roadNetwork = new RoadNetwork()

    const result = validator.validateBuilding(terrain, buildingManager, roadNetwork, def, 1000, 1000, 500)
    expect(result.isValid).toBe(false)
    expect(result.reason).toMatch(/حدود الجزيرة/)
  })

  it('rejects placement when colliding with existing building', () => {
    const buildingManager = new BuildingManager()
    const roadNetwork = new RoadNetwork()
    buildingManager.placeBuilding(def, 0, 0, 2.0)

    const result = validator.validateBuilding(terrain, buildingManager, roadNetwork, def, 1, 1, 500)
    expect(result.isValid).toBe(false)
    expect(result.reason).toMatch(/مبنى قائم/)
  })

  it('rejects placement when colliding with existing road', () => {
    const buildingManager = new BuildingManager()
    const roadNetwork = new RoadNetwork()
    roadNetwork.addTile({ key: '2,2', gridX: 2, gridZ: 2, height: 2.0, roadType: 'dirt' })

    const result = validator.validateBuilding(terrain, buildingManager, roadNetwork, def, 0, 0, 500)
    expect(result.isValid).toBe(false)
    expect(result.reason).toMatch(/طريق موجود/)
  })
})
