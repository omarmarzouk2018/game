/**
 * Types and definitions for the road network system.
 */

export type RoadType = 'dirt' | 'stone' | 'paved'

export interface RoadTileCoordinate {
  /** Grid coordinate on the X axis */
  readonly gridX: number
  /** Grid coordinate on the Z axis */
  readonly gridZ: number
}

export interface RoadTile {
  /** Unique key in the format "gridX,gridZ" */
  readonly key: string
  readonly gridX: number
  readonly gridZ: number
  readonly roadType: RoadType
  /** Elevation height on the terrain (Y axis) */
  readonly height: number
}

export interface RoadValidationResult {
  readonly isValid: boolean
  readonly reason?: string
  readonly newTileCount: number
  readonly totalCost: number
  readonly tiles: readonly RoadTileCoordinate[]
}

export interface RoadCostConfig {
  readonly costPerTile: Record<RoadType, number>
}

export const DEFAULT_ROAD_COSTS: RoadCostConfig = {
  costPerTile: {
    dirt: 5,
    stone: 15,
    paved: 30,
  },
}

/** Standard size in world units (meters) of a single road tile */
export const ROAD_TILE_SIZE = 2.0
export const TILE_SIZE = ROAD_TILE_SIZE
