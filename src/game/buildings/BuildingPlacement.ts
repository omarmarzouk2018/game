/**
 * @file BuildingPlacement.ts
 * Coordinates the selection, ghost/blueprint hovering, and placement workflow for buildings.
 * Strictly decoupled from Three.js scene and DOM elements.
 */

import { type IslandTerrain, sampleIslandTerrain } from '../island/terrain'
import { type EconomyManager } from '../economy/EconomyManager'
import { type RoadNetwork } from '../roads/RoadNetwork'
import { TILE_SIZE } from '../roads/RoadTypes'
import { type BuildingManager } from './BuildingManager'
import { type BuildingValidator } from './BuildingValidator'
import {
  type BuildingDefinition,
  type BuildingValidationResult,
  type PlacedBuilding,
} from './BuildingTypes'

export type BuildingPlacementListener = () => void

export class BuildingPlacement {
  private readonly terrain: IslandTerrain
  private readonly buildingManager: BuildingManager
  private readonly roadNetwork: RoadNetwork
  private readonly economy: EconomyManager
  private readonly validator: BuildingValidator

  private activeDefinition: BuildingDefinition | null = null
  private hoverGridCoord: { gridX: number; gridZ: number } | null = null
  private currentValidation: BuildingValidationResult | null = null
  private readonly listeners = new Set<BuildingPlacementListener>()

  constructor(
    terrain: IslandTerrain,
    buildingManager: BuildingManager,
    roadNetwork: RoadNetwork,
    economy: EconomyManager,
    validator: BuildingValidator,
  ) {
    this.terrain = terrain
    this.buildingManager = buildingManager
    this.roadNetwork = roadNetwork
    this.economy = economy
    this.validator = validator
  }

  public activate(def: BuildingDefinition): void {
    this.activeDefinition = def
    this.hoverGridCoord = null
    this.currentValidation = null
    this.notify()
  }

  public deactivate(): void {
    this.activeDefinition = null
    this.hoverGridCoord = null
    this.currentValidation = null
    this.notify()
  }

  public isActive(): boolean {
    return this.activeDefinition !== null
  }

  public getActiveDefinition(): BuildingDefinition | null {
    return this.activeDefinition
  }

  public getHoverGridCoord(): { gridX: number; gridZ: number } | null {
    return this.hoverGridCoord
  }

  public getCurrentValidation(): BuildingValidationResult | null {
    return this.currentValidation
  }

  /**
   * Updates current hovered grid coordinate based on mouse ray intersection point.
   */
  public updateHover(worldX: number, worldZ: number): void {
    if (!this.activeDefinition) return

    // Center the footprint around cursor: offset by floor(width/2), floor(depth/2)
    const def = this.activeDefinition
    const gridX = Math.floor(worldX / TILE_SIZE) - Math.floor(def.width / 2)
    const gridZ = Math.floor(worldZ / TILE_SIZE) - Math.floor(def.depth / 2)

    if (
      this.hoverGridCoord &&
      this.hoverGridCoord.gridX === gridX &&
      this.hoverGridCoord.gridZ === gridZ
    ) {
      return
    }

    this.hoverGridCoord = { gridX, gridZ }
    this.currentValidation = this.validator.validateBuilding(
      this.terrain,
      this.buildingManager,
      this.roadNetwork,
      def,
      gridX,
      gridZ,
      this.economy.getBalance(),
    )
    this.notify()
  }

  /**
   * Commits placement of the active building at the current hovered location.
   */
  public commit(): PlacedBuilding | null {
    if (!this.activeDefinition || !this.hoverGridCoord || !this.currentValidation) {
      return null
    }

    if (!this.currentValidation.isValid) {
      return null
    }

    const def = this.activeDefinition
    const { gridX, gridZ } = this.hoverGridCoord

    // Spend gold from economy
    const spent = this.economy.spend(def.cost.gold, `build_${def.id}`)
    if (!spent) {
      return null
    }

    // Sample terrain elevation at building center for placement base
    const centerX = (gridX + def.width / 2) * TILE_SIZE
    const centerZ = (gridZ + def.depth / 2) * TILE_SIZE
    const sample = sampleIslandTerrain(this.terrain, centerX, centerZ)

    const placed = this.buildingManager.placeBuilding(def, gridX, gridZ, sample.height)

    // Revalidate hover tile after placement (since tile is now occupied)
    if (this.activeDefinition) {
      this.currentValidation = this.validator.validateBuilding(
        this.terrain,
        this.buildingManager,
        this.roadNetwork,
        this.activeDefinition,
        gridX,
        gridZ,
        this.economy.getBalance(),
      )
    }

    this.notify()
    return placed
  }

  public subscribe(listener: BuildingPlacementListener): () => void {
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
        console.error('Error in BuildingPlacement listener:', err)
      }
    }
  }
}
