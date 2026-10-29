/**
 * @file BuildingRenderer.ts
 * Renders placed buildings and translucent architectural blueprint ghosts.
 * Displays glowing cyan/electric blue blueprint visuals when hovering valid terrain,
 * and translucent warning red when hovering invalid locations.
 */

import * as THREE from 'three'
import { type IslandTerrain, sampleIslandTerrain } from '../island/terrain'
import { TILE_SIZE } from '../roads/RoadTypes'
import { type BuildingManager } from './BuildingManager'
import { type BuildingPlacement } from './BuildingPlacement'
import {
  type BuildingDefinition,
  BUILDING_DEFINITIONS,
  getBuildingWorldBounds,
} from './BuildingTypes'

export class BuildingRenderer {
  private readonly parentScene: THREE.Scene
  private readonly terrain: IslandTerrain
  private readonly buildingManager: BuildingManager
  private readonly buildingPlacement: BuildingPlacement

  private readonly rootGroup = new THREE.Group()
  private readonly placedGroup = new THREE.Group()
  private readonly blueprintGroup = new THREE.Group()

  private readonly blueprintBaseMaterial: THREE.MeshBasicMaterial
  private readonly blueprintVolumeMaterial: THREE.MeshBasicMaterial
  private readonly blueprintEdgeMaterial: THREE.LineBasicMaterial

  private blueprintMesh: THREE.Group | null = null
  private readonly placedMeshes = new Map<string, THREE.Object3D>()
  private readonly unsubs: (() => void)[] = []

  constructor(
    parentScene: THREE.Scene,
    terrain: IslandTerrain,
    buildingManager: BuildingManager,
    buildingPlacement: BuildingPlacement,
  ) {
    this.parentScene = parentScene
    this.terrain = terrain
    this.buildingManager = buildingManager
    this.buildingPlacement = buildingPlacement

    this.rootGroup.name = 'BuildingsLayer'
    this.placedGroup.name = 'PlacedBuildings'
    this.blueprintGroup.name = 'BuildingBlueprint'
    this.blueprintGroup.renderOrder = 999

    this.rootGroup.add(this.placedGroup)
    this.rootGroup.add(this.blueprintGroup)
    this.parentScene.add(this.rootGroup)

    // Authentic translucent blueprint materials
    this.blueprintBaseMaterial = new THREE.MeshBasicMaterial({
      color: new THREE.Color(0x00d2ff),
      transparent: true,
      opacity: 0.50,
      side: THREE.DoubleSide,
      depthWrite: false,
      depthTest: false,
    })

    this.blueprintVolumeMaterial = new THREE.MeshBasicMaterial({
      color: new THREE.Color(0x00d2ff),
      transparent: true,
      opacity: 0.58,
      depthWrite: false,
      depthTest: false,
    })

    this.blueprintEdgeMaterial = new THREE.LineBasicMaterial({
      color: new THREE.Color(0x80e5ff),
      transparent: true,
      opacity: 0.90,
      linewidth: 2.0,
      depthTest: false,
    })

    this.unsubs.push(
      this.buildingManager.subscribe(() => this.rebuildPlacedBuildings()),
      this.buildingPlacement.subscribe(() => this.updateBlueprintPreview()),
    )

    this.rebuildPlacedBuildings()
  }

  public getRootGroup(): THREE.Group {
    return this.rootGroup
  }

  /**
   * Updates or clears the translucent blueprint preview under the cursor.
   */
  public updateBlueprintPreview(): void {
    if (this.blueprintMesh) {
      this.blueprintGroup.remove(this.blueprintMesh)
      this.disposeObjectHierarchy(this.blueprintMesh)
      this.blueprintMesh = null
    }

    if (!this.buildingPlacement.isActive()) {
      return
    }

    const def = this.buildingPlacement.getActiveDefinition()
    const hover = this.buildingPlacement.getHoverGridCoord()
    if (!def || !hover) {
      return
    }

    const validation = this.buildingPlacement.getCurrentValidation()
    const isValid = validation?.isValid ?? false

    // Translucent Blueprint Cyan (0x00d2ff) if valid, Translucent Warning Red (0xff4757) if invalid
    const tintColor = isValid ? 0x00d2ff : 0xff4757
    const edgeColor = isValid ? 0x80e5ff : 0xff9999

    this.blueprintBaseMaterial.color.setHex(tintColor)
    this.blueprintVolumeMaterial.color.setHex(tintColor)
    this.blueprintEdgeMaterial.color.setHex(edgeColor)

    const group = new THREE.Group()
    group.name = `Blueprint_${def.id}`

    const bounds = getBuildingWorldBounds(hover.gridX, hover.gridZ, def.width, def.depth)

    // 1. Terrain-conforming blueprint footprint base grid
    const baseMesh = this.createFootprintBaseMesh(hover.gridX, hover.gridZ, def.width, def.depth)
    group.add(baseMesh)

    // 2. Translucent 3D architectural blueprint volume with blueprint wireframe edges
    const centerSample = sampleIslandTerrain(this.terrain, bounds.centerX, bounds.centerZ)
    const baseElevation = centerSample.height

    const volumeMesh = this.createBuilding3DMesh(def, true)
    volumeMesh.position.set(bounds.centerX, baseElevation, bounds.centerZ)
    group.add(volumeMesh)

    this.blueprintMesh = group
    this.blueprintGroup.add(group)
  }

  /**
   * Rebuilds all placed buildings in the scene.
   */
  public rebuildPlacedBuildings(): void {
    // Clear removed buildings
    const currentBuildings = this.buildingManager.getAllBuildings()
    const currentIds = new Set(currentBuildings.map((b) => b.id))

    for (const [id, mesh] of this.placedMeshes) {
      if (!currentIds.has(id)) {
        this.placedGroup.remove(mesh)
        this.disposeObjectHierarchy(mesh)
        this.placedMeshes.delete(id)
      }
    }

    // Add new buildings
    for (const building of currentBuildings) {
      if (!this.placedMeshes.has(building.id)) {
        const def = BUILDING_DEFINITIONS[building.defId]
        if (!def) continue

        const bounds = getBuildingWorldBounds(
          building.gridX,
          building.gridZ,
          building.width,
          building.depth,
        )

        const mesh = this.createBuilding3DMesh(def, false)
        mesh.position.set(bounds.centerX, building.baseElevation, bounds.centerZ)
        this.placedGroup.add(mesh)
        this.placedMeshes.set(building.id, mesh)
      }
    }
  }

  /**
   * Creates a terrain-conforming grid base plane for the building footprint.
   */
  private createFootprintBaseMesh(
    gridX: number,
    gridZ: number,
    width: number,
    depth: number,
  ): THREE.Mesh {
    const segmentsX = width * 2
    const segmentsZ = depth * 2
    const geometry = new THREE.PlaneGeometry(
      width * TILE_SIZE,
      depth * TILE_SIZE,
      segmentsX,
      segmentsZ,
    )
    geometry.rotateX(-Math.PI / 2)

    const positions = geometry.attributes.position
    const minX = gridX * TILE_SIZE
    const minZ = gridZ * TILE_SIZE

    for (let i = 0; i < positions.count; i++) {
      const localX = positions.getX(i)
      const localZ = positions.getZ(i)
      const worldX = minX + (localX + (width * TILE_SIZE) / 2)
      const worldZ = minZ + (localZ + (depth * TILE_SIZE) / 2)
      const sample = sampleIslandTerrain(this.terrain, worldX, worldZ)
      // Slight elevation offset to sit directly over terrain
      positions.setY(i, sample.height + 0.08)
      positions.setX(i, worldX)
      positions.setZ(i, worldZ)
    }

    geometry.computeVertexNormals()

    const mesh = new THREE.Mesh(geometry, this.blueprintBaseMaterial)
    mesh.name = 'BlueprintBaseFootprint'
    return mesh
  }

  /**
   * Builds the 3D model geometry & materials for a building.
   * If isBlueprint is true, uses the translucent blueprint materials and adds blueprint edge lines.
   */
  private createBuilding3DMesh(def: BuildingDefinition, isBlueprint: boolean): THREE.Group {
    const group = new THREE.Group()
    const widthM = def.width * TILE_SIZE * 0.88
    const depthM = def.depth * TILE_SIZE * 0.88
    const wallHeight = def.height * 0.65
    const roofHeight = def.height * 0.35

    // Materials
    let wallMat: THREE.Material
    let roofMat: THREE.Material

    if (isBlueprint) {
      wallMat = this.blueprintVolumeMaterial
      roofMat = this.blueprintVolumeMaterial
    } else {
      wallMat = new THREE.MeshStandardMaterial({
        color: def.baseColor,
        roughness: 0.82,
        metalness: 0.05,
      })
      roofMat = new THREE.MeshStandardMaterial({
        color: def.roofColor,
        roughness: 0.75,
        metalness: 0.08,
      })
    }

    // 1. Foundation & Walls
    const wallGeo = new THREE.BoxGeometry(widthM, wallHeight, depthM)
    const wallMesh = new THREE.Mesh(wallGeo, wallMat)
    wallMesh.position.y = wallHeight / 2
    if (!isBlueprint) {
      wallMesh.castShadow = true
      wallMesh.receiveShadow = true
    }
    group.add(wallMesh)

    if (isBlueprint) {
      const wallEdges = new THREE.LineSegments(
        new THREE.EdgesGeometry(wallGeo),
        this.blueprintEdgeMaterial,
      )
      wallEdges.position.copy(wallMesh.position)
      group.add(wallEdges)
    }

    // 2. Roof Volume according to roofType
    if (def.roofType === 'gable') {
      const roofGeo = new THREE.ConeGeometry(
        Math.hypot(widthM, depthM) * 0.48,
        roofHeight,
        4,
      )
      roofGeo.rotateY(Math.PI / 4)
      const roofMesh = new THREE.Mesh(roofGeo, roofMat)
      roofMesh.position.y = wallHeight + roofHeight / 2
      if (!isBlueprint) {
        roofMesh.castShadow = true
        roofMesh.receiveShadow = true
      }
      group.add(roofMesh)

      if (isBlueprint) {
        const roofEdges = new THREE.LineSegments(
          new THREE.EdgesGeometry(roofGeo),
          this.blueprintEdgeMaterial,
        )
        roofEdges.position.copy(roofMesh.position)
        roofEdges.rotation.copy(roofMesh.rotation)
        group.add(roofEdges)
      }
    } else if (def.roofType === 'tent') {
      // Octagonal pavilion / market canopy
      const roofGeo = new THREE.ConeGeometry(widthM * 0.58, roofHeight * 1.2, 8)
      const roofMesh = new THREE.Mesh(roofGeo, roofMat)
      roofMesh.position.y = wallHeight + (roofHeight * 1.2) / 2
      if (!isBlueprint) {
        roofMesh.castShadow = true
        roofMesh.receiveShadow = true
      }
      group.add(roofMesh)

      if (isBlueprint) {
        const roofEdges = new THREE.LineSegments(
          new THREE.EdgesGeometry(roofGeo),
          this.blueprintEdgeMaterial,
        )
        roofEdges.position.copy(roofMesh.position)
        group.add(roofEdges)
      }
    } else if (def.roofType === 'well') {
      // Water well canopy
      const roofGeo = new THREE.CylinderGeometry(widthM * 0.45, widthM * 0.45, 0.3, 8)
      const roofMesh = new THREE.Mesh(roofGeo, roofMat)
      roofMesh.position.y = wallHeight + 0.15
      if (!isBlueprint) {
        roofMesh.castShadow = true
        roofMesh.receiveShadow = true
      }
      group.add(roofMesh)

      if (isBlueprint) {
        const roofEdges = new THREE.LineSegments(
          new THREE.EdgesGeometry(roofGeo),
          this.blueprintEdgeMaterial,
        )
        roofEdges.position.copy(roofMesh.position)
        group.add(roofEdges)
      }
    }

    return group
  }

  private disposeObjectHierarchy(obj: THREE.Object3D): void {
    obj.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose()
        const materials = Array.isArray(child.material) ? child.material : [child.material]
        materials.forEach((mat) => {
          if (
            mat !== this.blueprintBaseMaterial &&
            mat !== this.blueprintVolumeMaterial &&
            mat !== this.blueprintEdgeMaterial
          ) {
            mat.dispose()
          }
        })
      }
    })
  }

  public dispose(): void {
    for (const unsub of this.unsubs) {
      unsub()
    }
    this.unsubs.length = 0

    if (this.blueprintMesh) {
      this.blueprintGroup.remove(this.blueprintMesh)
      this.disposeObjectHierarchy(this.blueprintMesh)
      this.blueprintMesh = null
    }

    for (const [, mesh] of this.placedMeshes) {
      this.placedGroup.remove(mesh)
      this.disposeObjectHierarchy(mesh)
    }
    this.placedMeshes.clear()

    this.blueprintBaseMaterial.dispose()
    this.blueprintVolumeMaterial.dispose()
    this.blueprintEdgeMaterial.dispose()

    this.parentScene.remove(this.rootGroup)
  }
}
