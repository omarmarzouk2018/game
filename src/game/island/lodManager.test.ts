import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { LevelOfDetailManager, type SceneLodTargets } from './lodManager'

describe('LevelOfDetailManager', () => {
  it('initializes in overview mode with default thresholds', () => {
    const lod = new LevelOfDetailManager()
    expect(lod.getMode()).toBe('overview')
    expect(lod.getThreshold()).toBe(230)
  })

  it('switches between closeup and overview while preserving the exact same tree model without swapping models', () => {
    const lod = new LevelOfDetailManager({ overviewDistanceThreshold: 230, hysteresis: 15 })

    const geom = new THREE.BufferGeometry()
    const mat = new THREE.MeshBasicMaterial()
    const grassMesh = new THREE.InstancedMesh(geom, mat, 10)
    grassMesh.name = 'Grass'
    const farGrassMesh = new THREE.InstancedMesh(geom, mat, 10)
    farGrassMesh.name = 'Grass_Far'

    const fallbackTreeMesh = new THREE.InstancedMesh(geom, mat, 10)
    fallbackTreeMesh.name = 'DefaultTree'

    const pbrTrunkMesh = new THREE.InstancedMesh(geom, mat, 10)
    pbrTrunkMesh.name = 'PbrTree_Trunk'

    const pbrTreeCloseMesh = new THREE.InstancedMesh(geom, mat, 10)
    pbrTreeCloseMesh.name = 'PbrTree_Close_Foliage'

    const pbrTreeFarMesh = new THREE.InstancedMesh(geom, mat, 10)
    pbrTreeFarMesh.name = 'PbrTree_Far_Foliage'

    const fallbackRockMesh = new THREE.InstancedMesh(geom, mat, 10)
    const pbrRockMesh = new THREE.InstancedMesh(geom, mat, 10)
    pbrRockMesh.name = 'PbrRock'

    const targets: SceneLodTargets = {
      grassMesh,
      farGrassMesh,
      fallbackTreeMesh,
      pbrTreeMeshes: [pbrTrunkMesh, pbrTreeCloseMesh, pbrTreeFarMesh],
      fallbackRockMeshes: [fallbackRockMesh],
      pbrRockMeshes: [pbrRockMesh],
    }

    // High altitude / Overview (e.g. 450m full island view)
    const overviewMode = lod.update(450, targets)
    expect(overviewMode).toBe('overview')
    expect(grassMesh.visible).toBe(false)
    // Distant view replaces 3D grass with simple line grass
    expect(farGrassMesh.visible).toBe(true)
    // The fallback cone tree is NEVER visible once Scots pine is loaded
    expect(fallbackTreeMesh.visible).toBe(false)
    // The Scots pine trunk and overview foliage are visible
    expect(pbrTrunkMesh.visible).toBe(true)
    expect(pbrTreeFarMesh.visible).toBe(true)
    expect(pbrTreeCloseMesh.visible).toBe(false)
    expect(fallbackRockMesh.visible).toBe(false)
    expect(pbrRockMesh.visible).toBe(true)

    // Zooming in closer to ground (e.g. 150m close-up)
    const closeupMode = lod.update(150, targets)
    expect(closeupMode).toBe('closeup')
    expect(grassMesh.visible).toBe(true)
    expect(farGrassMesh.visible).toBe(false)
    expect(fallbackTreeMesh.visible).toBe(false)
    // The Scots pine trunk and close-up dense foliage are visible
    expect(pbrTrunkMesh.visible).toBe(true)
    expect(pbrTreeFarMesh.visible).toBe(false)
    expect(pbrTreeCloseMesh.visible).toBe(true)
    expect(fallbackRockMesh.visible).toBe(false)
    expect(pbrRockMesh.visible).toBe(true)

    // Hysteresis buffer check: at 235m (below 230 + 15 = 245m), still stays in closeup
    expect(lod.update(235, targets)).toBe('closeup')
    expect(grassMesh.visible).toBe(true)
    expect(farGrassMesh.visible).toBe(false)
    expect(pbrTreeCloseMesh.visible).toBe(true)

    // Zooming back out to overview (e.g. 250m)
    expect(lod.update(250, targets)).toBe('overview')
    expect(grassMesh.visible).toBe(false)
    expect(farGrassMesh.visible).toBe(true)
    expect(fallbackTreeMesh.visible).toBe(false)
    expect(pbrTrunkMesh.visible).toBe(true)
    expect(pbrTreeFarMesh.visible).toBe(true)
    expect(pbrTreeCloseMesh.visible).toBe(false)

    geom.dispose()
    mat.dispose()
  })

  it('keeps fallback elements active when PBR models are not yet loaded', () => {
    const lod = new LevelOfDetailManager()
    const geom = new THREE.BufferGeometry()
    const mat = new THREE.MeshBasicMaterial()
    const fallbackTreeMesh = new THREE.InstancedMesh(geom, mat, 5)

    const targets: SceneLodTargets = {
      fallbackTreeMesh,
      pbrTreeMeshes: null,
    }

    // Both in closeup and overview, fallback tree remains visible if PBR is not available
    lod.update(100, targets)
    expect(fallbackTreeMesh.visible).toBe(true)

    lod.update(400, targets)
    expect(fallbackTreeMesh.visible).toBe(true)

    geom.dispose()
    mat.dispose()
  })
})
