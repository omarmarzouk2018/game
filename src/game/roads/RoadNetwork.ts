import {
  type RoadTile,
  type RoadTileCoordinate,
  ROAD_TILE_SIZE,
} from './RoadTypes'

/**
 * RoadNetwork maintains the in-memory graph and grid representation of all built roads.
 * Pure data layer, decoupled from rendering and UI.
 */
export class RoadNetwork {
  private readonly tiles = new Map<string, RoadTile>()
  private readonly listeners = new Set<() => void>()

  public static tileKey(gridX: number, gridZ: number): string {
    return `${gridX},${gridZ}`
  }

  /**
   * Converts continuous world coordinates (meters) to discrete grid tile coordinates.
   */
  public static worldToGrid(worldX: number, worldZ: number): RoadTileCoordinate {
    return {
      gridX: Math.round(worldX / ROAD_TILE_SIZE),
      gridZ: Math.round(worldZ / ROAD_TILE_SIZE),
    }
  }

  /**
   * Converts discrete grid tile coordinates to continuous world center position (meters).
   */
  public static gridToWorld(gridX: number, gridZ: number): { worldX: number; worldZ: number } {
    return {
      worldX: gridX * ROAD_TILE_SIZE,
      worldZ: gridZ * ROAD_TILE_SIZE,
    }
  }

  /**
   * Checks whether a road tile exists at the given grid coordinates.
   */
  public hasTile(gridX: number, gridZ: number): boolean {
    return this.tiles.has(RoadNetwork.tileKey(gridX, gridZ))
  }

  /**
   * Retrieves a road tile at the given grid coordinates.
   */
  public getTile(gridX: number, gridZ: number): RoadTile | undefined {
    return this.tiles.get(RoadNetwork.tileKey(gridX, gridZ))
  }

  /**
   * Adds a single road tile to the network.
   * Returns true if newly added, or false if a tile already existed at this coordinate.
   */
  public addTile(tile: RoadTile): boolean {
    const key = RoadNetwork.tileKey(tile.gridX, tile.gridZ)
    if (this.tiles.has(key)) {
      return false
    }
    this.tiles.set(key, tile)
    this.notifyListeners()
    return true
  }

  /**
   * Adds multiple road tiles in batch.
   * Returns the count of newly added tiles.
   */
  public addTiles(newTiles: readonly RoadTile[]): number {
    let addedCount = 0
    for (const tile of newTiles) {
      const key = RoadNetwork.tileKey(tile.gridX, tile.gridZ)
      if (!this.tiles.has(key)) {
        this.tiles.set(key, tile)
        addedCount += 1
      }
    }
    if (addedCount > 0) {
      this.notifyListeners()
    }
    return addedCount
  }

  /**
   * Removes a road tile at the specified coordinate.
   */
  public removeTile(gridX: number, gridZ: number): boolean {
    const key = RoadNetwork.tileKey(gridX, gridZ)
    const removed = this.tiles.delete(key)
    if (removed) {
      this.notifyListeners()
    }
    return removed
  }

  /**
   * Returns an array of all road tiles currently in the network.
   */
  public getAllTiles(): readonly RoadTile[] {
    return Array.from(this.tiles.values())
  }

  /**
   * Total count of built road tiles.
   */
  public getTileCount(): number {
    return this.tiles.size
  }

  /**
   * Returns immediate cardinal neighbors (North, South, East, West) that contain a road.
   */
  public getNeighbors(gridX: number, gridZ: number): RoadTile[] {
    const directions: readonly [number, number][] = [
      [0, 1],  // South (+Z)
      [0, -1], // North (-Z)
      [1, 0],  // East (+X)
      [-1, 0], // West (-X)
    ]

    const neighbors: RoadTile[] = []
    for (const [dx, dz] of directions) {
      const neighbor = this.getTile(gridX + dx, gridZ + dz)
      if (neighbor) {
        neighbors.push(neighbor)
      }
    }
    return neighbors
  }

  /**
   * Clears all tiles in the road network.
   */
  public clear(): void {
    if (this.tiles.size > 0) {
      this.tiles.clear()
      this.notifyListeners()
    }
  }

  /**
   * Subscribes to changes in the road network.
   */
  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  private notifyListeners(): void {
    for (const listener of this.listeners) {
      try {
        listener()
      } catch (err) {
        console.error('Error in RoadNetwork listener:', err)
      }
    }
  }
}
