import {
  type IslandTerrain,
  sampleIslandTerrain,
  sampleTerrainSlope,
} from '../island/terrain'
import { EconomyManager } from '../economy/EconomyManager'
import { RoadNetwork } from './RoadNetwork'
import {
  type RoadTileCoordinate,
  type RoadType,
  type RoadValidationResult,
  DEFAULT_ROAD_COSTS,
} from './RoadTypes'

export interface RoadValidatorConfig {
  readonly minHeight?: number
  readonly maxSlopeDegrees?: number
  readonly costPerTile?: number
}

const DEFAULT_MIN_HEIGHT = 0.4
const DEFAULT_MAX_SLOPE = 25.0

/**
 * RoadValidator encapsulates all validation rules for building roads.
 * Pure business logic module, independent of UI and rendering.
 */
export class RoadValidator {
  private readonly minHeight: number
  private readonly maxSlope: number

  constructor(config?: RoadValidatorConfig) {
    this.minHeight = config?.minHeight ?? DEFAULT_MIN_HEIGHT
    this.maxSlope = config?.maxSlopeDegrees ?? DEFAULT_MAX_SLOPE
  }

  /**
   * Validates a single road tile coordinate against terrain constraints.
   */
  public validateTile(
    terrain: IslandTerrain,
    gridX: number,
    gridZ: number,
  ): { isValid: boolean; reason?: string; height: number } {
    const { worldX, worldZ } = RoadNetwork.gridToWorld(gridX, gridZ)

    // Check island boundary bounds
    const halfWidth = terrain.width * 0.5
    const halfDepth = terrain.depth * 0.5
    if (Math.abs(worldX) >= halfWidth - 2 || Math.abs(worldZ) >= halfDepth - 2) {
      return { isValid: false, reason: 'خارج حدود الجزيرة', height: 0 }
    }

    // Sample terrain elevation and water check
    const sample = sampleIslandTerrain(terrain, worldX, worldZ)
    if (!sample.land || sample.height < this.minHeight) {
      return { isValid: false, reason: 'لا يمكن البناء داخل المياه', height: sample.height }
    }

    // Check terrain slope
    const slope = sampleTerrainSlope(terrain, worldX, worldZ)
    if (slope > this.maxSlope) {
      return { isValid: false, reason: 'المنحدر شديد الوعورة', height: sample.height }
    }

    return { isValid: true, height: sample.height }
  }

  /**
   * Validates an entire proposed road path against terrain and financial balance.
   */
  public validatePath(
    terrain: IslandTerrain,
    roadNetwork: RoadNetwork,
    economy: EconomyManager,
    pathTiles: readonly RoadTileCoordinate[],
    roadType: RoadType = 'dirt',
  ): RoadValidationResult {
    if (pathTiles.length === 0) {
      return {
        isValid: false,
        reason: 'المسار فارغ',
        newTileCount: 0,
        totalCost: 0,
        tiles: pathTiles,
      }
    }

    let newTileCount = 0
    const costPerTile = DEFAULT_ROAD_COSTS.costPerTile[roadType]

    for (const tile of pathTiles) {
      // Validate terrain feasibility
      const tileCheck = this.validateTile(terrain, tile.gridX, tile.gridZ)
      if (!tileCheck.isValid) {
        return {
          isValid: false,
          reason: tileCheck.reason,
          newTileCount: 0,
          totalCost: 0,
          tiles: pathTiles,
        }
      }

      // Check whether this tile is brand new (not yet constructed)
      if (!roadNetwork.hasTile(tile.gridX, tile.gridZ)) {
        newTileCount += 1
      }
    }

    const totalCost = newTileCount * costPerTile

    // Check financial balance
    if (!economy.canAfford(totalCost)) {
      return {
        isValid: false,
        reason: 'الرصيد المالي غير كافٍ',
        newTileCount,
        totalCost,
        tiles: pathTiles,
      }
    }

    return {
      isValid: true,
      newTileCount,
      totalCost,
      tiles: pathTiles,
    }
  }
}
