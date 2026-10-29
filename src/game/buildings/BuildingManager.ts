/**
 * @file BuildingManager.ts
 * In-memory spatial storage and lifecycle manager for placed buildings.
 * Adheres strictly to Separation of Concerns: pure data layer, zero rendering dependencies.
 */

import {
  type BuildingDefinition,
  type PlacedBuilding,
} from './BuildingTypes'

export type BuildingManagerListener = () => void

export class BuildingManager {
  private readonly buildings = new Map<string, PlacedBuilding>()
  private readonly occupiedTiles = new Map<string, string>() // key `${gridX},${gridZ}` -> buildingId
  private readonly listeners = new Set<BuildingManagerListener>()
  private nextId = 1

  private static tileKey(gridX: number, gridZ: number): string {
    return `${gridX},${gridZ}`
  }

  /**
   * Checks if a single tile is occupied by an existing building.
   */
  public isTileOccupied(gridX: number, gridZ: number): boolean {
    return this.occupiedTiles.has(BuildingManager.tileKey(gridX, gridZ))
  }

  /**
   * Checks if all tiles in a rectangular footprint are completely free.
   */
  public canPlaceFootprint(gridX: number, gridZ: number, width: number, depth: number): boolean {
    for (let x = 0; x < width; x++) {
      for (let z = 0; z < depth; z++) {
        if (this.isTileOccupied(gridX + x, gridZ + z)) {
          return false
        }
      }
    }
    return true
  }

  /**
   * Places a building onto the grid and registers all occupied tiles.
   */
  public placeBuilding(
    def: BuildingDefinition,
    gridX: number,
    gridZ: number,
    baseElevation: number,
  ): PlacedBuilding {
    if (!this.canPlaceFootprint(gridX, gridZ, def.width, def.depth)) {
      throw new Error(`Footprint for building ${def.id} at (${gridX}, ${gridZ}) is occupied`)
    }

    const id = `bld_${def.id}_${this.nextId++}`
    const building: PlacedBuilding = {
      id,
      defId: def.id,
      gridX,
      gridZ,
      width: def.width,
      depth: def.depth,
      baseElevation,
      placedAt: Date.now(),
    }

    this.buildings.set(id, building)

    for (let x = 0; x < def.width; x++) {
      for (let z = 0; z < def.depth; z++) {
        this.occupiedTiles.set(BuildingManager.tileKey(gridX + x, gridZ + z), id)
      }
    }

    this.notify()
    return building
  }

  /**
   * Removes a building by its instance ID and frees its tiles.
   */
  public removeBuilding(id: string): boolean {
    const building = this.buildings.get(id)
    if (!building) return false

    for (let x = 0; x < building.width; x++) {
      for (let z = 0; z < building.depth; z++) {
        this.occupiedTiles.delete(BuildingManager.tileKey(building.gridX + x, building.gridZ + z))
      }
    }

    this.buildings.delete(id)
    this.notify()
    return true
  }

  /**
   * Returns all placed buildings.
   */
  public getAllBuildings(): readonly PlacedBuilding[] {
    return Array.from(this.buildings.values())
  }

  /**
   * Finds the building occupying a given tile, if any.
   */
  public getBuildingAt(gridX: number, gridZ: number): PlacedBuilding | undefined {
    const buildingId = this.occupiedTiles.get(BuildingManager.tileKey(gridX, gridZ))
    if (!buildingId) return undefined
    return this.buildings.get(buildingId)
  }

  public getCount(): number {
    return this.buildings.size
  }

  public subscribe(listener: BuildingManagerListener): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  private notify(): void {
    for (const listener of this.listeners) {
      try {
        listener()
      } catch (err) {
        console.error('Error in BuildingManager listener:', err)
      }
    }
  }
}
