/**
 * @file RoadRenderer.ts
 * Renders built 3D organic dirt roads with procedural PBR textures and
 * translucent architectural blueprint ghost previews during construction.
 */

import * as THREE from 'three'
import { type IslandTerrain } from '../island/terrain'
import { RoadNetwork } from './RoadNetwork'
import { RoadBuilder } from './RoadBuilder'
import { buildRoadsGeometry } from './RoadGeometry'
import { createDirtRoadTextureSet, type RoadTextureSet } from './RoadTextures'
import { type RoadTileCoordinate } from './RoadTypes'

export class RoadRenderer {
  private readonly parentScene: THREE.Scene
  private readonly terrain: IslandTerrain
  private readonly roadNetwork: RoadNetwork
  private readonly roadBuilder: RoadBuilder

  private readonly sceneGroup = new THREE.Group()
  private readonly textureSet: RoadTextureSet
  private readonly builtMaterial: THREE.MeshStandardMaterial
  private readonly previewMaterial: THREE.MeshBasicMaterial
  private readonly previewEdgeMaterial: THREE.LineBasicMaterial
  private builtMesh: THREE.Mesh | null = null
  private previewMesh: THREE.Mesh | null = null
  private unsubs: (() => void)[] = []

  constructor(
    parentScene: THREE.Scene,
    terrain: IslandTerrain,
    roadNetwork: RoadNetwork,
    roadBuilder: RoadBuilder,
  ) {
    this.parentScene = parentScene
    this.terrain = terrain
    this.roadNetwork = roadNetwork
    this.roadBuilder = roadBuilder

    this.sceneGroup.name = 'RoadsLayer'
    this.parentScene.add(this.sceneGroup)

    // Generate high-resolution procedural PBR dirt road texture atlas
    this.textureSet = createDirtRoadTextureSet()

    // Authentic, high-fidelity PBR dirt road material with neighbor-aware alpha blending
    this.builtMaterial = new THREE.MeshStandardMaterial({
      color: new THREE.Color(0xffffff),
      map: this.textureSet.diffuse,
      normalMap: this.textureSet.normal,
      normalScale: new THREE.Vector2(0.9, 0.9),
      roughnessMap: this.textureSet.roughness,
      roughness: 0.88,
      metalness: 0.02,
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -1.0,
      polygonOffsetUnits: -1.0,
    })

    this.builtMaterial.onBeforeCompile = (shader) => {
      shader.vertexShader = `
        attribute float alpha;
        varying float vRoadAlpha;
        ${shader.vertexShader}
      `.replace(
        '#include <color_vertex>',
        `
        #include <color_vertex>
        vRoadAlpha = alpha;
        `
      )

      shader.fragmentShader = `
        varying float vRoadAlpha;
        ${shader.fragmentShader}
      `.replace(
        '#include <color_fragment>',
        `
        #include <color_fragment>
        diffuseColor.a *= vRoadAlpha;
        `
      )
    }

    // Translucent blueprint preview material (cyan for valid, red for invalid)
    this.previewMaterial = new THREE.MeshBasicMaterial({
      color: new THREE.Color(0x00d2ff),
      transparent: true,
      opacity: 0.60,
      side: THREE.DoubleSide,
      depthWrite: false,
      depthTest: false,
    })

    this.previewEdgeMaterial = new THREE.LineBasicMaterial({
      color: new THREE.Color(0x80e5ff),
      transparent: true,
      opacity: 0.85,
      depthTest: false,
    })

    this.unsubs.push(
      this.roadNetwork.subscribe(() => this.rebuildBuiltMesh()),
      this.roadBuilder.subscribe(() => this.updatePreviewMesh()),
    )

    this.rebuildBuiltMesh()
  }

  public getSceneGroup(): THREE.Group {
    return this.sceneGroup
  }

  public getBuiltMaterial(): THREE.MeshStandardMaterial {
    return this.builtMaterial
  }

  public rebuildBuiltMesh(): void {
    if (this.builtMesh) {
      this.sceneGroup.remove(this.builtMesh)
      this.builtMesh.geometry.dispose()
      this.builtMesh = null
    }

    const tiles = this.roadNetwork.getAllTiles()
    if (tiles.length === 0) return

    const geometry = buildRoadsGeometry(this.terrain, tiles)
    this.builtMesh = new THREE.Mesh(geometry, this.builtMaterial)
    this.builtMesh.name = 'BuiltRoads'
    this.builtMesh.receiveShadow = true
    this.builtMesh.castShadow = false
    this.sceneGroup.add(this.builtMesh)
  }

  public updatePreviewMesh(): void {
    if (this.previewMesh) {
      this.sceneGroup.remove(this.previewMesh)
      this.previewMesh.geometry.dispose()
      this.previewMesh = null
    }

    if (!this.roadBuilder.isActive()) {
      return
    }

    let tilesToRender: readonly RoadTileCoordinate[] = []
    let isValid = false

    if (this.roadBuilder.isDragging()) {
      tilesToRender = this.roadBuilder.getCurrentPath()
      isValid = this.roadBuilder.getCurrentValidation()?.isValid ?? false
    } else {
      const hover = this.roadBuilder.getHoverCoord()
      if (hover) {
        tilesToRender = [hover]
        isValid = this.roadBuilder.getHoverValidation()?.isValid ?? false
      }
    }

    if (tilesToRender.length === 0) return

    const tintColor = isValid ? 0x00d2ff : 0xff4757
    const edgeColor = isValid ? 0x80e5ff : 0xff9999
    this.previewMaterial.color.setHex(tintColor)
    this.previewEdgeMaterial.color.setHex(edgeColor)

    // Build geometry connected with all built tiles so junctions appear organically in preview
    const geometry = buildRoadsGeometry(this.terrain, tilesToRender, this.roadNetwork.getAllTiles())
    this.previewMesh = new THREE.Mesh(geometry, this.previewMaterial)
    this.previewMesh.name = 'RoadPreview'
    this.previewMesh.renderOrder = 999

    // Add glowing blueprint wireframe outline edges
    const wireframeGeo = new THREE.WireframeGeometry(geometry)
    const wireframeLines = new THREE.LineSegments(wireframeGeo, this.previewEdgeMaterial)
    wireframeLines.renderOrder = 1000
    this.previewMesh.add(wireframeLines)

    this.sceneGroup.add(this.previewMesh)
  }

  public dispose(): void {
    for (const unsub of this.unsubs) {
      unsub()
    }
    this.unsubs = []

    if (this.builtMesh) {
      this.sceneGroup.remove(this.builtMesh)
      this.builtMesh.geometry.dispose()
      this.builtMesh = null
    }

    if (this.previewMesh) {
      this.sceneGroup.remove(this.previewMesh)
      this.previewMesh.geometry.dispose()
      this.previewMesh = null
    }

    this.builtMaterial.dispose()
    this.previewMaterial.dispose()
    this.previewEdgeMaterial.dispose()

    this.textureSet.diffuse.dispose()
    this.textureSet.normal.dispose()
    this.textureSet.roughness.dispose()

    this.parentScene.remove(this.sceneGroup)
  }
}
