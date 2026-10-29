/**
 * @file BuildingTypes.ts
 * Data types, models, and catalog definitions for Anno-style buildings.
 * Strictly decoupled from UI and rendering (Separation of Concerns).
 */

import { TILE_SIZE } from '../roads/RoadTypes'

export type BuildingCategoryId = 'infrastructure' | 'farmers' | 'industry' | 'harbor'
export type BuildingRoofType = 'gable' | 'flat' | 'well' | 'tent'

export interface BuildingCost {
  readonly gold: number
  readonly wood?: number
  readonly stone?: number
}

export interface BuildingDefinition {
  readonly id: string
  readonly name: string
  readonly category: BuildingCategoryId
  readonly width: number // in tiles
  readonly depth: number // in tiles
  readonly cost: BuildingCost
  readonly height: number // in meters
  readonly roofType: BuildingRoofType
  readonly baseColor: number
  readonly roofColor: number
  readonly requiresRoad?: boolean
  readonly maintenance?: number
}

export interface PlacedBuilding {
  readonly id: string
  readonly defId: string
  readonly gridX: number
  readonly gridZ: number
  readonly width: number
  readonly depth: number
  readonly baseElevation: number
  readonly placedAt: number
}

export interface BuildingValidationResult {
  readonly isValid: boolean
  readonly reason?: string
  readonly maxSlope: number
  readonly minElevation: number
  readonly maxElevation: number
  readonly canAfford: boolean
  readonly occupiedTiles: readonly { gridX: number; gridZ: number }[]
}

export interface BuildingWorldBounds {
  readonly minX: number
  readonly maxX: number
  readonly minZ: number
  readonly maxZ: number
  readonly centerX: number
  readonly centerZ: number
  readonly widthMeters: number
  readonly depthMeters: number
}

/**
 * Calculates world bounds and center point from grid coordinates and tile dimensions.
 */
export function getBuildingWorldBounds(
  gridX: number,
  gridZ: number,
  width: number,
  depth: number,
  tileSize = TILE_SIZE,
): BuildingWorldBounds {
  const minX = gridX * tileSize
  const maxX = (gridX + width) * tileSize
  const minZ = gridZ * tileSize
  const maxZ = (gridZ + depth) * tileSize
  const widthMeters = width * tileSize
  const depthMeters = depth * tileSize
  const centerX = minX + widthMeters / 2
  const centerZ = minZ + depthMeters / 2

  return {
    minX,
    maxX,
    minZ,
    maxZ,
    centerX,
    centerZ,
    widthMeters,
    depthMeters,
  }
}

/**
 * Standard catalog of placeable buildings matching buildMenuData.
 */
export const BUILDING_DEFINITIONS: Record<string, BuildingDefinition> = {
  pioneer_cottage: {
    id: 'pioneer_cottage',
    name: 'كوخ المزارعين',
    category: 'farmers',
    width: 3,
    depth: 3,
    cost: { gold: 10, wood: 2 },
    height: 3.2,
    roofType: 'gable',
    baseColor: 0x8b5a2b, // warm timber wood
    roofColor: 0xa83232, // terracotta red roof
    requiresRoad: true,
    maintenance: 0,
  },
  market_square: {
    id: 'market_square',
    name: 'ساحة السوق',
    category: 'farmers',
    width: 4,
    depth: 4,
    cost: { gold: 100, wood: 10 },
    height: 4.0,
    roofType: 'tent',
    baseColor: 0xd4a373, // stone pavers & timber pillars
    roofColor: 0x2a9d8f, // teal striped canopy
    requiresRoad: true,
    maintenance: 5,
  },
  water_well: {
    id: 'water_well',
    name: 'بئر مياه',
    category: 'farmers',
    width: 2,
    depth: 2,
    cost: { gold: 30, wood: 4 },
    height: 2.4,
    roofType: 'well',
    baseColor: 0x6c757d, // stone well basin
    roofColor: 0x5a3e28, // wooden canopy
    requiresRoad: false,
    maintenance: 1,
  },
  lumberjack_cabin: {
    id: 'lumberjack_cabin',
    name: 'كوخ الحطّاب',
    category: 'industry',
    width: 3,
    depth: 3,
    cost: { gold: 50 },
    height: 3.2,
    roofType: 'gable',
    baseColor: 0x5c4033, // rustic log cabin
    roofColor: 0x3d5a2b, // pine forest green roof
    requiresRoad: true,
    maintenance: 3,
  },
  sawmill: {
    id: 'sawmill',
    name: 'منشرة الخشب',
    category: 'industry',
    width: 3,
    depth: 3,
    cost: { gold: 80, wood: 6 },
    height: 3.8,
    roofType: 'gable',
    baseColor: 0x7f5539, // timber frame
    roofColor: 0x8c2d19, // dark red shingle roof
    requiresRoad: true,
    maintenance: 4,
  },
}
