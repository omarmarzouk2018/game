import { describe, it, expect } from 'vitest'
import { createIslandTerrain, type IslandTerrain } from '../island/terrain'
import { EconomyManager } from '../economy/EconomyManager'
import { RoadNetwork } from './RoadNetwork'
import { RoadBuilder } from './RoadBuilder'

describe('RoadBuilder', () => {
  const terrain: IslandTerrain = createIslandTerrain(41723)

  it('generates orthogonal paths correctly', () => {
    const start = { gridX: 0, gridZ: 0 }
    const end = { gridX: 3, gridZ: 2 }

    const path = RoadBuilder.generateOrthogonalPath(start, end)
    expect(path[0]).toEqual(start)
    expect(path[path.length - 1]).toEqual(end)
    // Distance in steps: |3| + |2| + 1 = 6 tiles
    expect(path).toHaveLength(6)
  })

  it('handles activation and deactivation states', () => {
    const roadNetwork = new RoadNetwork()
    const economy = new EconomyManager(500)
    const builder = new RoadBuilder(terrain, roadNetwork, economy)

    expect(builder.isActive()).toBe(false)
    builder.activate('dirt')
    expect(builder.isActive()).toBe(true)
    expect(builder.getRoadType()).toBe('dirt')

    builder.deactivate()
    expect(builder.isActive()).toBe(false)
  })

  it('manages drag lifecycle and commits valid road', () => {
    const roadNetwork = new RoadNetwork()
    const economy = new EconomyManager(500)
    const builder = new RoadBuilder(terrain, roadNetwork, economy)

    builder.activate('dirt')
    builder.startDrag(0, 0)
    expect(builder.isDragging()).toBe(true)

    // Drag to 6 meters east (approx 3 tiles)
    builder.updateDrag(6, 0)
    const validation = builder.getCurrentValidation()
    expect(validation).not.toBeNull()
    expect(validation?.isValid).toBe(true)
    expect(validation?.newTileCount).toBe(4) // grid 0, 1, 2, 3 = 4 tiles
    expect(validation?.totalCost).toBe(20) // 4 * 5 = 20

    const committed = builder.commit()
    expect(committed).toBe(true)
    expect(builder.isDragging()).toBe(false)

    // Check economy deduction
    expect(economy.getBalance()).toBe(480) // 500 - 20 = 480

    // Check tiles added to network
    expect(roadNetwork.getTileCount()).toBe(4)
    expect(roadNetwork.hasTile(0, 0)).toBe(true)
    expect(roadNetwork.hasTile(3, 0)).toBe(true)
  })

  it('cancels drag without committing or spending money', () => {
    const roadNetwork = new RoadNetwork()
    const economy = new EconomyManager(500)
    const builder = new RoadBuilder(terrain, roadNetwork, economy)

    builder.activate('dirt')
    builder.startDrag(0, 0)
    builder.updateDrag(10, 0)
    builder.cancelDrag()

    expect(builder.isDragging()).toBe(false)
    expect(economy.getBalance()).toBe(500)
    expect(roadNetwork.getTileCount()).toBe(0)
  })

  it('rejects commit when validation fails (e.g. into water)', () => {
    const roadNetwork = new RoadNetwork()
    const economy = new EconomyManager(500)
    const builder = new RoadBuilder(terrain, roadNetwork, economy)

    builder.activate('dirt')
    builder.startDrag(0, 0)
    // Drag way out into ocean
    builder.updateDrag(-200, -200)

    const validation = builder.getCurrentValidation()
    expect(validation?.isValid).toBe(false)

    const committed = builder.commit()
    expect(committed).toBe(false)
    expect(roadNetwork.getTileCount()).toBe(0)
    expect(economy.getBalance()).toBe(500)
  })
})
