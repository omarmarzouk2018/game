import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { LevelOfDetailManager, type SceneLodTargets } from './lodManager'

describe('LevelOfDetailManager', () => {
  it('initializes in overview mode with default 4-tier thresholds', () => {
    const lod = new LevelOfDetailManager()
    expect(lod.getMode()).toBe('overview')
    expect(lod.getThresholds()).toEqual({
      closeup: 120,
      medium: 250,
      overview: 600,
    })
  })

  it('switches smoothly across all 4 levels of detail (closeup, medium, overview, distant)', () => {
    const lod = new LevelOfDetailManager({
      closeupThreshold: 120,
      mediumThreshold: 250,
      overviewThreshold: 600,
      hysteresis: 15,
    })

    const geom = new THREE.BufferGeometry()
    const mat = new THREE.MeshBasicMaterial()
    const grassMesh = new THREE.InstancedMesh(geom, mat, 10)
    grassMesh.name = 'Grass'
    const farGrassMesh = new THREE.InstancedMesh(geom, mat, 10)
    farGrassMesh.name = 'Grass_Far'

    const fallbackTreeMesh = new THREE.InstancedMesh(geom, mat, 10)
    fallbackTreeMesh.name = 'DefaultTree'

    const pbrTrunkCloseMesh = new THREE.InstancedMesh(geom, mat, 10)
    pbrTrunkCloseMesh.name = 'PbrTree_Close_Trunk'

    const pbrTreeCloseFoliage = new THREE.InstancedMesh(geom, mat, 10)
    pbrTreeCloseFoliage.name = 'PbrTree_Close_Foliage'

    const pbrTrunkFarMesh = new THREE.InstancedMesh(geom, mat, 10)
    pbrTrunkFarMesh.name = 'PbrTree_Far_Trunk'

    const pbrTreeFarFoliage = new THREE.InstancedMesh(geom, mat, 10)
    pbrTreeFarFoliage.name = 'PbrTree_Far_Foliage'

    const fallbackRockMesh = new THREE.InstancedMesh(geom, mat, 10)
    const pbrRockCloseMesh = new THREE.InstancedMesh(geom, mat, 10)
    pbrRockCloseMesh.name = 'PbrRock_Close'
    const pbrRockFarMesh = new THREE.InstancedMesh(geom, mat, 10)
    pbrRockFarMesh.name = 'PbrRock_Far'

    const deer = new THREE.Object3D()
    const bird = new THREE.Object3D()

    const targets: SceneLodTargets = {
      grassMesh,
      farGrassMesh,
      fallbackTreeMesh,
      pbrTreeMeshes: [pbrTrunkCloseMesh, pbrTreeCloseFoliage, pbrTrunkFarMesh, pbrTreeFarFoliage],
      fallbackRockMeshes: [fallbackRockMesh],
      pbrRockMeshes: [pbrRockCloseMesh, pbrRockFarMesh],
      animalObjects: [deer],
      birdObjects: [bird],
    }

    // 1. Level 1: Closeup (< 120m, e.g. 70m)
    const closeupMode = lod.update(70, targets)
    expect(closeupMode).toBe('closeup')
    expect(grassMesh.visible).toBe(true)
    expect(farGrassMesh.visible).toBe(false)
    expect(pbrTrunkCloseMesh.visible).toBe(true)
    expect(pbrTreeCloseFoliage.visible).toBe(true)
    expect(pbrTreeFarFoliage.visible).toBe(false)
    expect(pbrRockCloseMesh.visible).toBe(true)
    expect(pbrRockFarMesh.visible).toBe(false)
    expect(deer.visible).toBe(true)
    expect(bird.visible).toBe(true)

    // 2. Level 2: Medium (120m - 250m, e.g. 180m)
    const mediumMode = lod.update(180, targets)
    expect(mediumMode).toBe('medium')
    expect(grassMesh.visible).toBe(false)
    // Lightweight line grass active in medium
    expect(farGrassMesh.visible).toBe(true)
    // Same trunk, lighter needle cards
    expect(pbrTrunkCloseMesh.visible).toBe(true)
    expect(pbrTreeCloseFoliage.visible).toBe(false)
    expect(pbrTreeFarFoliage.visible).toBe(true)
    // Procedural rocks in medium mode
    expect(pbrRockCloseMesh.visible).toBe(false)
    expect(fallbackRockMesh.visible).toBe(true)
    expect(deer.visible).toBe(true)
    expect(bird.visible).toBe(true)

    // 3. Level 3: Overview (250m - 600m, e.g. 450m)
    const overviewMode = lod.update(450, targets)
    expect(overviewMode).toBe('overview')
    // Grass completely hidden to maximize GPU performance; meadows rely on vertex color
    expect(grassMesh.visible).toBe(false)
    expect(farGrassMesh.visible).toBe(false)
    // Far foliage + far trunk visible
    expect(pbrTrunkFarMesh.visible).toBe(true)
    expect(pbrTreeFarFoliage.visible).toBe(true)
    expect(pbrTreeCloseFoliage.visible).toBe(false)
    // Brown terrain dots visible
    expect(pbrRockFarMesh.visible).toBe(true)
    expect(pbrRockCloseMesh.visible).toBe(false)
    // Ground animals hidden; soaring birds visible
    expect(deer.visible).toBe(false)
    expect(bird.visible).toBe(true)

    // 4. Level 4: Distant / Strategic (>= 600m, e.g. 750m)
    const distantMode = lod.update(750, targets)
    expect(distantMode).toBe('distant')
    expect(grassMesh.visible).toBe(false)
    expect(farGrassMesh.visible).toBe(false)
    expect(pbrTreeFarFoliage.visible).toBe(true)
    // Rocks and wildlife completely hidden to maximize throughput
    expect(pbrRockCloseMesh.visible).toBe(false)
    expect(deer.visible).toBe(false)
    expect(bird.visible).toBe(false)

    // 5. Hysteresis check when zooming back in
    // At 590m (above 600 - 15 = 585m), stays in distant
    expect(lod.update(590, targets)).toBe('distant')
    // At 570m (below 585m), switches to overview
    expect(lod.update(570, targets)).toBe('overview')

    geom.dispose()
    mat.dispose()
  })

  it('handles hysteresis buffers cleanly across all boundaries without oscillation', () => {
    const lod = new LevelOfDetailManager({
      closeupThreshold: 120,
      mediumThreshold: 250,
      overviewThreshold: 600,
      hysteresis: 15,
    })

    const targets: SceneLodTargets = {}

    // Start in closeup
    expect(lod.update(80, targets)).toBe('closeup')

    // Approaching closeup -> medium threshold (120m)
    // Below 120 + 15 = 135m, stays in closeup
    expect(lod.update(125, targets)).toBe('closeup')
    expect(lod.update(134, targets)).toBe('closeup')
    // At or above 135m, transitions to medium
    expect(lod.update(136, targets)).toBe('medium')

    // Returning towards closeup: above 120 - 15 = 105m, stays in medium
    expect(lod.update(110, targets)).toBe('medium')
    // Below 105m, transitions back to closeup
    expect(lod.update(100, targets)).toBe('closeup')
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
