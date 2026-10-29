import { describe, expect, it } from 'vitest'
import { BuildingManager } from './BuildingManager'
import { BUILDING_DEFINITIONS } from './BuildingTypes'

describe('BuildingManager', () => {
  it('places a building and marks its tiles as occupied', () => {
    const manager = new BuildingManager()
    const def = BUILDING_DEFINITIONS.pioneer_cottage // 3x3

    expect(manager.canPlaceFootprint(0, 0, def.width, def.depth)).toBe(true)
    const placed = manager.placeBuilding(def, 0, 0, 2.5)

    expect(placed.id).toBeDefined()
    expect(placed.defId).toBe('pioneer_cottage')
    expect(placed.gridX).toBe(0)
    expect(placed.gridZ).toBe(0)
    expect(manager.getCount()).toBe(1)

    // Check all 3x3 tiles are occupied
    for (let x = 0; x < 3; x++) {
      for (let z = 0; z < 3; z++) {
        expect(manager.isTileOccupied(x, z)).toBe(true)
        expect(manager.getBuildingAt(x, z)?.id).toBe(placed.id)
      }
    }

    // Adjacent tiles are not occupied
    expect(manager.isTileOccupied(3, 0)).toBe(false)
    expect(manager.isTileOccupied(0, 3)).toBe(false)
  })

  it('rejects placement if any tile is already occupied', () => {
    const manager = new BuildingManager()
    const def = BUILDING_DEFINITIONS.pioneer_cottage // 3x3
    manager.placeBuilding(def, 0, 0, 2.0)

    // Overlapping placement
    expect(manager.canPlaceFootprint(1, 1, def.width, def.depth)).toBe(false)
    expect(() => manager.placeBuilding(def, 1, 1, 2.0)).toThrow(/occupied/)
  })

  it('removes a building and frees its tiles', () => {
    const manager = new BuildingManager()
    const def = BUILDING_DEFINITIONS.water_well // 2x2
    const placed = manager.placeBuilding(def, 5, 5, 1.5)

    expect(manager.isTileOccupied(5, 5)).toBe(true)
    const removed = manager.removeBuilding(placed.id)

    expect(removed).toBe(true)
    expect(manager.getCount()).toBe(0)
    expect(manager.isTileOccupied(5, 5)).toBe(false)
  })

  it('notifies subscribers on place and remove', () => {
    const manager = new BuildingManager()
    let notifications = 0
    const unsub = manager.subscribe(() => {
      notifications++
    })

    const placed = manager.placeBuilding(BUILDING_DEFINITIONS.water_well, 0, 0, 1.0)
    expect(notifications).toBe(1)

    manager.removeBuilding(placed.id)
    expect(notifications).toBe(2)

    unsub()
    manager.placeBuilding(BUILDING_DEFINITIONS.water_well, 10, 10, 1.0)
    expect(notifications).toBe(2)
  })
})
