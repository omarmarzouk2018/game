import { describe, it, expect, vi } from 'vitest'
import { RoadNetwork } from './RoadNetwork'
import { type RoadTile, ROAD_TILE_SIZE } from './RoadTypes'

describe('RoadNetwork', () => {
  it('converts world coordinates to grid coordinates accurately', () => {
    const grid1 = RoadNetwork.worldToGrid(0, 0)
    expect(grid1).toEqual({ gridX: 0, gridZ: 0 })

    const grid2 = RoadNetwork.worldToGrid(ROAD_TILE_SIZE * 3.4, -ROAD_TILE_SIZE * 2.1)
    expect(grid2).toEqual({ gridX: 3, gridZ: -2 })

    const world = RoadNetwork.gridToWorld(5, -10)
    expect(world).toEqual({ worldX: 10, worldZ: -20 })
  })

  it('adds and retrieves road tiles', () => {
    const network = new RoadNetwork()
    const tile: RoadTile = {
      key: '2,3',
      gridX: 2,
      gridZ: 3,
      roadType: 'dirt',
      height: 4.5,
    }

    const added = network.addTile(tile)
    expect(added).toBe(true)
    expect(network.hasTile(2, 3)).toBe(true)
    expect(network.getTile(2, 3)).toEqual(tile)
    expect(network.getTileCount()).toBe(1)

    // Cannot duplicate same coordinate
    const duplicate = network.addTile(tile)
    expect(duplicate).toBe(false)
    expect(network.getTileCount()).toBe(1)
  })

  it('adds multiple tiles in batch and notifies listeners', () => {
    const network = new RoadNetwork()
    const listener = vi.fn()
    network.subscribe(listener)

    const tiles: RoadTile[] = [
      { key: '0,0', gridX: 0, gridZ: 0, roadType: 'dirt', height: 2.0 },
      { key: '0,1', gridX: 0, gridZ: 1, roadType: 'dirt', height: 2.1 },
      { key: '0,2', gridX: 0, gridZ: 2, roadType: 'dirt', height: 2.2 },
    ]

    const addedCount = network.addTiles(tiles)
    expect(addedCount).toBe(3)
    expect(network.getTileCount()).toBe(3)
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('finds cardinal neighbors for junctions and intersections', () => {
    const network = new RoadNetwork()
    network.addTiles([
      { key: '0,0', gridX: 0, gridZ: 0, roadType: 'dirt', height: 1.0 },
      { key: '0,1', gridX: 0, gridZ: 1, roadType: 'dirt', height: 1.0 }, // South
      { key: '1,0', gridX: 1, gridZ: 0, roadType: 'dirt', height: 1.0 }, // East
      { key: '-1,0', gridX: -1, gridZ: 0, roadType: 'dirt', height: 1.0 }, // West
    ])

    const neighbors = network.getNeighbors(0, 0)
    expect(neighbors).toHaveLength(3)
    const neighborKeys = neighbors.map((n) => n.key)
    expect(neighborKeys).toContain('0,1')
    expect(neighborKeys).toContain('1,0')
    expect(neighborKeys).toContain('-1,0')
  })

  it('removes tiles and clears network correctly', () => {
    const network = new RoadNetwork()
    network.addTile({ key: '1,1', gridX: 1, gridZ: 1, roadType: 'dirt', height: 3.0 })

    const removed = network.removeTile(1, 1)
    expect(removed).toBe(true)
    expect(network.hasTile(1, 1)).toBe(false)

    network.addTile({ key: '2,2', gridX: 2, gridZ: 2, roadType: 'dirt', height: 3.0 })
    network.clear()
    expect(network.getTileCount()).toBe(0)
  })
})
