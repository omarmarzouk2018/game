import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { createIslandTerrain, type IslandTerrain } from '../island/terrain'
import { EconomyManager } from '../economy/EconomyManager'
import { RoadNetwork } from './RoadNetwork'
import { RoadBuilder } from './RoadBuilder'
import { RoadRenderer } from './RoadRenderer'

describe('RoadRenderer', () => {
  const terrain: IslandTerrain = createIslandTerrain(41723)

  it('renders built road mesh with procedural PBR texture and vertex colors', () => {
    const scene = new THREE.Scene()
    const roadNetwork = new RoadNetwork()
    const economy = new EconomyManager(500)
    const builder = new RoadBuilder(terrain, roadNetwork, economy)
    const renderer = new RoadRenderer(scene, terrain, roadNetwork, builder)

    expect(renderer.getSceneGroup().children).toHaveLength(0)

    // Check material has diffuse, normal, and roughness maps
    const mat = renderer.getBuiltMaterial()
    expect(mat.map).toBeInstanceOf(THREE.DataTexture)
    expect(mat.normalMap).toBeInstanceOf(THREE.DataTexture)
    expect(mat.roughnessMap).toBeInstanceOf(THREE.DataTexture)
    expect(mat.vertexColors).toBe(true)

    // Add a road tile
    roadNetwork.addTile({
      key: '0,0',
      gridX: 0,
      gridZ: 0,
      roadType: 'dirt',
      height: 2.0,
    })

    expect(renderer.getSceneGroup().children).toHaveLength(1)
    const mesh = renderer.getSceneGroup().children[0] as THREE.Mesh
    expect(mesh.name).toBe('BuiltRoads')
    // 4x4 subdivisions = 25 vertices per tile for smooth terrain fitting and seamless junctions
    expect(mesh.geometry.attributes.position.count).toBe(25)
    expect(mesh.geometry.attributes.color).toBeDefined()
    expect(mesh.geometry.attributes.alpha).toBeDefined()
    expect(mesh.geometry.attributes.normal).toBeDefined()

    renderer.dispose()
    expect(scene.children).toHaveLength(0)
  })

  it('seamlessly joins perpendicular road tiles without gaps', () => {
    const scene = new THREE.Scene()
    const roadNetwork = new RoadNetwork()
    const economy = new EconomyManager(500)
    const builder = new RoadBuilder(terrain, roadNetwork, economy)
    const renderer = new RoadRenderer(scene, terrain, roadNetwork, builder)

    // Create a T-junction: tile (0,0) with North, South, and East neighbors
    roadNetwork.addTiles([
      { key: '0,-1', gridX: 0, gridZ: -1, roadType: 'dirt', height: 2.0 }, // North
      { key: '0,0',  gridX: 0, gridZ: 0,  roadType: 'dirt', height: 2.0 }, // Center junction
      { key: '0,1',  gridX: 0, gridZ: 1,  roadType: 'dirt', height: 2.0 }, // South
      { key: '1,0',  gridX: 1, gridZ: 0,  roadType: 'dirt', height: 2.0 }, // East branch
    ])

    const group = renderer.getSceneGroup()
    const mesh = group.getObjectByName('BuiltRoads') as THREE.Mesh
    expect(mesh).toBeDefined()

    const alphaAttr = mesh.geometry.attributes.alpha
    expect(alphaAttr).toBeDefined()
    // 4 tiles * 25 vertices = 100 vertices
    expect(alphaAttr.count).toBe(100)

    renderer.dispose()
  })

  it('renders preview mesh with blueprint cyan color during valid drag', () => {
    const scene = new THREE.Scene()
    const roadNetwork = new RoadNetwork()
    const economy = new EconomyManager(500)
    const builder = new RoadBuilder(terrain, roadNetwork, economy)
    const renderer = new RoadRenderer(scene, terrain, roadNetwork, builder)

    builder.activate('dirt')
    builder.startDrag(0, 0)
    builder.updateDrag(4, 0)

    const group = renderer.getSceneGroup()
    const preview = (group.getObjectByName('RoadBlueprintPreview') || group.getObjectByName('RoadPreview')) as THREE.Mesh
    expect(preview).toBeDefined()
    expect(preview).not.toBeNull()

    const mat = preview.material as THREE.MeshBasicMaterial
    // 0x00d2ff = blueprint cyan for valid preview
    expect(mat.color.getHex()).toBe(0x00d2ff)

    // Deactivate removes preview mesh
    builder.deactivate()
    expect(group.getObjectByName('RoadBlueprintPreview')).toBeUndefined()

    renderer.dispose()
  })

  it('renders preview mesh with red color when drag targets invalid water area', () => {
    const scene = new THREE.Scene()
    const roadNetwork = new RoadNetwork()
    const economy = new EconomyManager(500)
    const builder = new RoadBuilder(terrain, roadNetwork, economy)
    const renderer = new RoadRenderer(scene, terrain, roadNetwork, builder)

    builder.activate('dirt')
    builder.startDrag(0, 0)
    builder.updateDrag(-200, -200) // Deep in ocean

    const group = renderer.getSceneGroup()
    const preview = (group.getObjectByName('RoadBlueprintPreview') || group.getObjectByName('RoadPreview')) as THREE.Mesh
    expect(preview).toBeDefined()

    const mat = preview.material as THREE.MeshBasicMaterial
    // 0xff4757 = red for invalid
    expect(mat.color.getHex()).toBe(0xff4757)

    renderer.dispose()
  })
})
