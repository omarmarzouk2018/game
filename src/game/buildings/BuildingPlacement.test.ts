import { describe, expect, it } from 'vitest'
import { createIslandTerrain } from '../island/terrain'
import { EconomyManager } from '../economy/EconomyManager'
import { RoadNetwork } from '../roads/RoadNetwork'
import { BuildingManager } from './BuildingManager'
import { BuildingValidator } from './BuildingValidator'
import { BuildingPlacement } from './BuildingPlacement'
import { BUILDING_DEFINITIONS } from './BuildingTypes'

describe('BuildingPlacement', () => {
  const terrain = createIslandTerrain(41723)
  const def = BUILDING_DEFINITIONS.pioneer_cottage // 3x3, cost: 10

  function createFixture(startingBalance = 100) {
    const economy = new EconomyManager(startingBalance)
    const roadNetwork = new RoadNetwork()
    const buildingManager = new BuildingManager()
    const validator = new BuildingValidator()
    const placement = new BuildingPlacement(terrain, buildingManager, roadNetwork, economy, validator)
    return { economy, roadNetwork, buildingManager, placement }
  }

  it('activates and deactivates building selection', () => {
    const { placement } = createFixture()
    expect(placement.isActive()).toBe(false)

    placement.activate(def)
    expect(placement.isActive()).toBe(true)
    expect(placement.getActiveDefinition()?.id).toBe('pioneer_cottage')

    placement.deactivate()
    expect(placement.isActive()).toBe(false)
    expect(placement.getActiveDefinition()).toBeNull()
  })

  it('updates hover coordinates and validates placement under cursor', () => {
    const { placement } = createFixture()
    placement.activate(def)

    placement.updateHover(0, 0)
    expect(placement.getHoverGridCoord()).not.toBeNull()
    const validation = placement.getCurrentValidation()
    expect(validation).not.toBeNull()
    expect(validation?.isValid).toBe(true)
  })

  it('commits placement and deducts economy balance', () => {
    const { placement, economy, buildingManager } = createFixture(100)
    placement.activate(def)
    placement.updateHover(0, 0)

    const placed = placement.commit()
    expect(placed).not.toBeNull()
    expect(buildingManager.getCount()).toBe(1)
    expect(economy.getBalance()).toBe(90) // 100 - 10
  })

  it('fails to commit when invalid or insufficient funds', () => {
    const { placement, economy, buildingManager } = createFixture(5) // less than 10 gold
    placement.activate(def)
    placement.updateHover(0, 0)

    const placed = placement.commit()
    expect(placed).toBeNull()
    expect(buildingManager.getCount()).toBe(0)
    expect(economy.getBalance()).toBe(5)
  })
})
