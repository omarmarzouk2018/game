/**
 * @file BuildingValidator.ts
 * Validation engine for building placement.
 * Ensures buildings are placed on valid, flat land, without overlapping roads or other buildings.
 */

import { type IslandTerrain, sampleIslandTerrain, sampleTerrainSlope } from '../island/terrain'
import { type RoadNetwork } from '../roads/RoadNetwork'
import { TILE_SIZE } from '../roads/RoadTypes'
import { type BuildingManager } from './BuildingManager'
import {
  type BuildingDefinition,
  type BuildingValidationResult,
  getBuildingWorldBounds,
} from './BuildingTypes'

export class BuildingValidator {
  public static readonly MAX_SLOPE_DEGREES = 18.0
  public static readonly MIN_ELEVATION = 0.8
  public static readonly MAX_HEIGHT_VARIATION = 2.5

  /**
   * Validates whether a building definition can be placed at (gridX, gridZ).
   */
  public validateBuilding(
    terrain: IslandTerrain,
    buildingManager: BuildingManager,
    roadNetwork: RoadNetwork,
    def: BuildingDefinition,
    gridX: number,
    gridZ: number,
    currentGoldBalance: number,
  ): BuildingValidationResult {
    const occupiedTiles: { gridX: number; gridZ: number }[] = []
    for (let x = 0; x < def.width; x++) {
      for (let z = 0; z < def.depth; z++) {
        occupiedTiles.push({ gridX: gridX + x, gridZ: gridZ + z })
      }
    }

    const bounds = getBuildingWorldBounds(gridX, gridZ, def.width, def.depth)
    const halfWidth = terrain.width / 2 - 4
    const halfDepth = terrain.depth / 2 - 4

    // 1. Boundary check
    if (
      bounds.minX < -halfWidth ||
      bounds.maxX > halfWidth ||
      bounds.minZ < -halfDepth ||
      bounds.maxZ > halfDepth
    ) {
      return {
        isValid: false,
        reason: 'خارج حدود الجزيرة القابلة للبناء',
        maxSlope: 90,
        minElevation: 0,
        maxElevation: 0,
        canAfford: currentGoldBalance >= def.cost.gold,
        occupiedTiles,
      }
    }

    // 2. Collision with existing buildings
    if (!buildingManager.canPlaceFootprint(gridX, gridZ, def.width, def.depth)) {
      return {
        isValid: false,
        reason: 'يتعارض مع مبنى قائم آخر',
        maxSlope: 0,
        minElevation: 0,
        maxElevation: 0,
        canAfford: currentGoldBalance >= def.cost.gold,
        occupiedTiles,
      }
    }

    // 3. Collision with existing roads
    for (const tile of occupiedTiles) {
      if (roadNetwork.hasTile(tile.gridX, tile.gridZ)) {
        return {
          isValid: false,
          reason: 'يتعارض مع طريق موجود',
          maxSlope: 0,
          minElevation: 0,
          maxElevation: 0,
          canAfford: currentGoldBalance >= def.cost.gold,
          occupiedTiles,
        }
      }
    }

    // 4. Terrain samples across footprint
    let minElev = Infinity
    let maxElev = -Infinity
    let maxSlope = 0

    // Sample each tile center and edges
    for (let x = 0; x < def.width; x++) {
      for (let z = 0; z < def.depth; z++) {
        const wx = (gridX + x + 0.5) * TILE_SIZE
        const wz = (gridZ + z + 0.5) * TILE_SIZE

        const sample = sampleIslandTerrain(terrain, wx, wz)
        if (!sample.land || sample.height < BuildingValidator.MIN_ELEVATION) {
          return {
            isValid: false,
            reason: 'لا يمكن البناء في البحر أو على الشاطئ المنخفض',
            maxSlope,
            minElevation: sample.height,
            maxElevation: sample.height,
            canAfford: currentGoldBalance >= def.cost.gold,
            occupiedTiles,
          }
        }

        minElev = Math.min(minElev, sample.height)
        maxElev = Math.max(maxElev, sample.height)

        const slope = sampleTerrainSlope(terrain, wx, wz)
        maxSlope = Math.max(maxSlope, slope)

        if (slope > BuildingValidator.MAX_SLOPE_DEGREES) {
          return {
            isValid: false,
            reason: `المنحدر شديد جدًا (${slope.toFixed(1)}° > ${BuildingValidator.MAX_SLOPE_DEGREES}°)`,
            maxSlope,
            minElevation: minElev,
            maxElevation: maxElev,
            canAfford: currentGoldBalance >= def.cost.gold,
            occupiedTiles,
          }
        }
      }
    }

    // 5. Height variation check across footprint
    if (maxElev - minElev > BuildingValidator.MAX_HEIGHT_VARIATION) {
      return {
        isValid: false,
        reason: 'تضاريس الأرض غير مستوية للبناء',
        maxSlope,
        minElevation: minElev,
        maxElevation: maxElev,
        canAfford: currentGoldBalance >= def.cost.gold,
        occupiedTiles,
      }
    }

    // 6. Economy affordability check
    const canAfford = currentGoldBalance >= def.cost.gold
    if (!canAfford) {
      return {
        isValid: false,
        reason: `الذهب غير كافٍ (المطلوب: ${def.cost.gold} عملة)`,
        maxSlope,
        minElevation: minElev,
        maxElevation: maxElev,
        canAfford: false,
        occupiedTiles,
      }
    }

    return {
      isValid: true,
      maxSlope,
      minElevation: minElev,
      maxElevation: maxElev,
      canAfford: true,
      occupiedTiles,
    }
  }
}
