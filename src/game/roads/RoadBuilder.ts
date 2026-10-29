import { type IslandTerrain } from '../island/terrain'
import { EconomyManager } from '../economy/EconomyManager'
import { RoadNetwork } from './RoadNetwork'
import { RoadValidator } from './RoadValidator'
import {
  type RoadTile,
  type RoadTileCoordinate,
  type RoadType,
  type RoadValidationResult,
} from './RoadTypes'

export type RoadBuilderStateListener = () => void

/**
 * RoadBuilder coordinates the drag-to-draw workflow for roads.
 * Pure business logic layer decoupled from Three.js rendering and DOM events.
 */
export class RoadBuilder {
  private readonly terrain: IslandTerrain
  private readonly roadNetwork: RoadNetwork
  private readonly economy: EconomyManager
  private readonly validator: RoadValidator

  private active = false
  private dragging = false
  private roadType: RoadType = 'dirt'
  private startCoord: RoadTileCoordinate | null = null
  private currentCoord: RoadTileCoordinate | null = null
  private currentPath: RoadTileCoordinate[] = []
  private currentValidation: RoadValidationResult | null = null
  private hoverCoord: RoadTileCoordinate | null = null
  private hoverValidation: RoadValidationResult | null = null
  private readonly listeners = new Set<RoadBuilderStateListener>()

  constructor(
    terrain: IslandTerrain,
    roadNetwork: RoadNetwork,
    economy: EconomyManager,
    validator: RoadValidator = new RoadValidator(),
  ) {
    this.terrain = terrain
    this.roadNetwork = roadNetwork
    this.economy = economy
    this.validator = validator
  }

  /**
   * Enables the road building tool.
   */
  public activate(roadType: RoadType = 'dirt'): void {
    this.active = true
    this.roadType = roadType
    this.cancelDrag()
    this.notify()
  }

  /**
   * Disables the road building tool and cancels any pending drag.
   */
  public deactivate(): void {
    this.active = false
    this.hoverCoord = null
    this.hoverValidation = null
    this.cancelDrag()
    this.notify()
  }

  public isActive(): boolean {
    return this.active
  }

  public isDragging(): boolean {
    return this.dragging
  }

  public getRoadType(): RoadType {
    return this.roadType
  }

  public getCurrentPath(): readonly RoadTileCoordinate[] {
    return this.currentPath
  }

  public getCurrentValidation(): RoadValidationResult | null {
    return this.currentValidation
  }

  public getHoverCoord(): RoadTileCoordinate | null {
    return this.hoverCoord
  }

  public getHoverValidation(): RoadValidationResult | null {
    return this.hoverValidation
  }

  /**
   * Updates hovered tile when moving cursor over the terrain while road tool is active.
   */
  public updateHover(worldX: number, worldZ: number): void {
    if (!this.active || this.dragging) return

    const newCoord = RoadNetwork.worldToGrid(worldX, worldZ)
    if (
      this.hoverCoord &&
      this.hoverCoord.gridX === newCoord.gridX &&
      this.hoverCoord.gridZ === newCoord.gridZ
    ) {
      return
    }

    this.hoverCoord = newCoord
    this.hoverValidation = this.validator.validatePath(
      this.terrain,
      this.roadNetwork,
      this.economy,
      [newCoord],
      this.roadType,
    )
    this.notify()
  }

  /**
   * Generates an orthogonal (L-shaped) tile path between two grid points.
   */
  public static generateOrthogonalPath(
    start: RoadTileCoordinate,
    end: RoadTileCoordinate,
  ): RoadTileCoordinate[] {
    const path: RoadTileCoordinate[] = []
    const dx = end.gridX - start.gridX
    const dz = end.gridZ - start.gridZ

    const stepX = dx >= 0 ? 1 : -1
    const stepZ = dz >= 0 ? 1 : -1

    if (Math.abs(dx) >= Math.abs(dz)) {
      // Move along X first, then along Z
      for (let x = start.gridX; x !== end.gridX + stepX; x += stepX) {
        path.push({ gridX: x, gridZ: start.gridZ })
      }
      for (let z = start.gridZ + stepZ; z !== end.gridZ + stepZ; z += stepZ) {
        path.push({ gridX: end.gridX, gridZ: z })
      }
    } else {
      // Move along Z first, then along X
      for (let z = start.gridZ; z !== end.gridZ + stepZ; z += stepZ) {
        path.push({ gridX: start.gridX, gridZ: z })
      }
      for (let x = start.gridX + stepX; x !== end.gridX + stepX; x += stepX) {
        path.push({ gridX: x, gridZ: end.gridZ })
      }
    }

    return path
  }

  /**
   * Starts a drag operation from a given world position.
   */
  public startDrag(worldX: number, worldZ: number): void {
    if (!this.active) return

    const coord = RoadNetwork.worldToGrid(worldX, worldZ)
    this.dragging = true
    this.startCoord = coord
    this.currentCoord = coord
    this.updatePath()
  }

  /**
   * Updates drag position with current mouse world position.
   */
  public updateDrag(worldX: number, worldZ: number): void {
    if (!this.active || !this.dragging || !this.startCoord) return

    const newCoord = RoadNetwork.worldToGrid(worldX, worldZ)
    if (
      this.currentCoord &&
      this.currentCoord.gridX === newCoord.gridX &&
      this.currentCoord.gridZ === newCoord.gridZ
    ) {
      return
    }

    this.currentCoord = newCoord
    this.updatePath()
  }

  /**
   * Commits the road path: deducts cost and places tiles into the road network.
   * Returns true if successfully placed.
   */
  public commit(): boolean {
    if (!this.active || !this.dragging || !this.currentValidation) {
      this.cancelDrag()
      return false
    }

    if (!this.currentValidation.isValid) {
      this.cancelDrag()
      return false
    }

    const { totalCost, newTileCount } = this.currentValidation

    // If completely existing tiles, no cost deduction needed
    if (newTileCount > 0) {
      const spent = this.economy.spend(totalCost, `build_${this.roadType}_road`)
      if (!spent) {
        this.cancelDrag()
        return false
      }
    }

    // Convert coordinates to full RoadTile objects with height
    const newTiles: RoadTile[] = []
    for (const coord of this.currentPath) {
      if (!this.roadNetwork.hasTile(coord.gridX, coord.gridZ)) {
        const check = this.validator.validateTile(this.terrain, coord.gridX, coord.gridZ)
        newTiles.push({
          key: RoadNetwork.tileKey(coord.gridX, coord.gridZ),
          gridX: coord.gridX,
          gridZ: coord.gridZ,
          roadType: this.roadType,
          height: check.height,
        })
      }
    }

    this.roadNetwork.addTiles(newTiles)
    this.cancelDrag()
    return true
  }

  /**
   * Cancels the active drag operation.
   */
  public cancelDrag(): void {
    const wasDragging = this.dragging
    this.dragging = false
    this.startCoord = null
    this.currentCoord = null
    this.currentPath = []
    this.currentValidation = null

    if (wasDragging) {
      this.notify()
    }
  }

  public subscribe(listener: RoadBuilderStateListener): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  private updatePath(): void {
    if (!this.startCoord || !this.currentCoord) return

    this.currentPath = RoadBuilder.generateOrthogonalPath(this.startCoord, this.currentCoord)
    this.currentValidation = this.validator.validatePath(
      this.terrain,
      this.roadNetwork,
      this.economy,
      this.currentPath,
      this.roadType,
    )
    this.notify()
  }

  private notify(): void {
    for (const listener of this.listeners) {
      try {
        listener()
      } catch (err) {
        console.error('Error in RoadBuilder listener:', err)
      }
    }
  }
}
