import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { createRockPlacements } from './rocks'
import { createForestPlacements } from './trees'
import {
  hash2D,
  isTerrainRock,
  isTerrainSand,
  sampleIslandTerrain,
  sampleTerrainNormal,
  sampleTerrainSlope,
  type IslandTerrain,
} from './terrain'

/**
 * Generates an optimized decimation of needle quads from the original tree foliage geometry.
 * Scales vertices outward slightly around each quad center to maintain natural crown volume
 * and silhouette matching the original tree model at varying levels of detail.
 */
/**
 * Creates a lightweight brown speck/dot geometry (4 triangles) for distant overview mode.
 * Replaces heavy 3D rock meshes with simple brown terrain dots when looking from high altitude
 * as requested ("تبان نقطة بنية بس مش لازم صخور").
 */
function createBrownDotGeometry(radius = 0.55, height = 0.1): THREE.BufferGeometry {
  const geom = new THREE.BufferGeometry()
  const positions = new Float32Array([
    0, height, 0, // 0: apex
    0, 0.01, -radius, // 1: north
    radius, 0.01, 0, // 2: east
    0, 0.01, radius, // 3: south
    -radius, 0.01, 0, // 4: west
  ])
  const indices = new Uint16Array([
    0, 1, 2, // North-East
    0, 2, 3, // East-South
    0, 3, 4, // South-West
    0, 4, 1, // West-North
  ])
  geom.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geom.setIndex(new THREE.BufferAttribute(indices, 1))
  geom.computeVertexNormals()
  return geom
}

function decimateFoliageQuads(
  sourceGeometry: THREE.BufferGeometry,
  step: number,
  scaleFactor: number,
): THREE.BufferGeometry {
  const geom = sourceGeometry.clone()
  if (!geom.index || geom.index.count <= 10000) {
    return geom
  }

  const oldIndices = geom.index.array
  const quadCount = Math.floor(oldIndices.length / 6)
  const keptQuads = Math.floor(quadCount / step)
  const newIndices = new (oldIndices instanceof Uint32Array ? Uint32Array : Uint16Array)(keptQuads * 6)
  const posAttr = geom.attributes.position.clone()
  geom.setAttribute('position', posAttr)

  let out = 0
  for (let q = 0; q < quadCount; q += step) {
    const src = q * 6
    const i0 = oldIndices[src]
    const i1 = oldIndices[src + 1]
    const i2 = oldIndices[src + 2]
    const i3 = oldIndices[src + 5]

    // Calculate quad center
    const cx = (posAttr.getX(i0) + posAttr.getX(i1) + posAttr.getX(i2) + posAttr.getX(i3)) * 0.25
    const cy = (posAttr.getY(i0) + posAttr.getY(i1) + posAttr.getY(i2) + posAttr.getY(i3)) * 0.25
    const cz = (posAttr.getZ(i0) + posAttr.getZ(i1) + posAttr.getZ(i2) + posAttr.getZ(i3)) * 0.25

    // Scale vertices outward to expand needle coverage naturally
    for (const idx of [i0, i1, i2, i3]) {
      const vx = cx + (posAttr.getX(idx) - cx) * scaleFactor
      const vy = cy + (posAttr.getY(idx) - cy) * scaleFactor
      const vz = cz + (posAttr.getZ(idx) - cz) * scaleFactor
      posAttr.setXYZ(idx, vx, vy, vz)
    }

    for (let k = 0; k < 6; k++) {
      newIndices[out++] = oldIndices[src + k]
    }
  }
  posAttr.needsUpdate = true
  geom.setIndex(new THREE.BufferAttribute(newIndices, 1))
  return geom
}

/**
 * Creates optimized instanced meshes from a loaded glTF Object3D model across placed terrain coordinates.
 * Collapses multi-mesh models sharing materials (such as Scots Pine bark and crown limbs) to drastically
 * minimize GPU draw calls, memory bandwidth, and shadow rendering passes.
 */
export function addInstances(
  scene: THREE.Scene,
  root: THREE.Object3D,
  terrain: IslandTerrain,
  resources: Set<THREE.Material | THREE.BufferGeometry | THREE.Texture>,
  kind: 'tree' | 'rock',
): THREE.InstancedMesh[] {
  root.updateMatrixWorld(true)
  const meshes: THREE.Mesh[] = []
  root.traverse((child) => {
    if (child instanceof THREE.Mesh) meshes.push(child)
  })
  if (meshes.length === 0) return []

  let placements: Array<[number, number]>
  if (kind === 'tree') {
    const forest = createForestPlacements(terrain)
    placements = [...forest.woodland, ...forest.shoreline]
  } else {
    placements = createRockPlacements(terrain)
  }

  // Group meshes by material so multiple submeshes can be merged into a single InstancedMesh
  type MaterialGroup = {
    material: THREE.Material
    geometries: THREE.BufferGeometry[]
    isFoliage: boolean
  }
  const closeTrunkGroups = new Map<THREE.Material, MaterialGroup>()
  const farTrunkGroups = new Map<THREE.Material, MaterialGroup>()
  const closeFoliageGroups = new Map<THREE.Material, MaterialGroup>()
  const farFoliageGroups = new Map<THREE.Material, MaterialGroup>()

  for (const mesh of meshes) {
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    const material = materials[0]
    if (!material) continue

    resources.add(material)
    for (const value of Object.values(material)) {
      if (value instanceof THREE.Texture) resources.add(value)
    }

    const transformedGeometry = mesh.geometry.clone()
    transformedGeometry.applyMatrix4(mesh.matrixWorld)

    const meshName = mesh.name.toLowerCase()

    // Optimization: Skip interior micro-twigs hidden within needle foliage cards
    if (kind === 'tree' && meshName.includes('branchlet')) {
      transformedGeometry.dispose()
      continue
    }

    const isFoliage =
      kind === 'tree' &&
      (meshName.includes('needle') ||
        meshName.includes('foliage') ||
        material.name?.toLowerCase().includes('foliage'))

    if (isFoliage) {
      if (material instanceof THREE.MeshStandardMaterial) {
        material.alphaTest = 0.28
        material.side = THREE.DoubleSide
      }

      // Close-up foliage: high needle card density (~2,700 needle cards per tree)
      const closeGeom = decimateFoliageQuads(transformedGeometry, 18, 1.42)
      let closeGroup = closeFoliageGroups.get(material)
      if (!closeGroup) {
        closeGroup = { material, geometries: [], isFoliage: true }
        closeFoliageGroups.set(material, closeGroup)
      }
      closeGroup.geometries.push(closeGeom)

      // Overview/Far foliage: same Scots pine needle cards decimated (~240 cards, lightweight, matching crown silhouette)
      const farGeom = decimateFoliageQuads(transformedGeometry, 100, 1.6)
      let farGroup = farFoliageGroups.get(material)
      if (!farGroup) {
        farGroup = { material, geometries: [], isFoliage: true }
        farFoliageGroups.set(material, farGroup)
      }
      farGroup.geometries.push(farGeom)

      transformedGeometry.dispose()
    } else {
      if (kind === 'rock') {
        // High-poly close-up Rock 09 geometry
        let closeGroup = closeTrunkGroups.get(material)
        if (!closeGroup) {
          closeGroup = { material, geometries: [], isFoliage: false }
          closeTrunkGroups.set(material, closeGroup)
        }
        closeGroup.geometries.push(transformedGeometry)
      } else {
        // Tree trunk and crown limbs (Scots Pine model)
        let closeGroup = closeTrunkGroups.get(material)
        if (!closeGroup) {
          closeGroup = { material, geometries: [], isFoliage: false }
          closeTrunkGroups.set(material, closeGroup)
        }
        let farGroup = farTrunkGroups.get(material)
        if (!farGroup) {
          farGroup = { material, geometries: [], isFoliage: false }
          farTrunkGroups.set(material, farGroup)
        }

        if (meshName.includes('crown_limb')) {
          const match = meshName.match(/\d+$/)
          const limbIndex = match ? parseInt(match[0], 10) : 0
          if (limbIndex % 2 === 0) {
            closeGroup.geometries.push(transformedGeometry.clone())
          }
          if (limbIndex === 0 || limbIndex === 2) {
            farGroup.geometries.push(transformedGeometry.clone())
          }
          transformedGeometry.dispose()
        } else {
          // Main trunk
          closeGroup.geometries.push(transformedGeometry.clone())
          farGroup.geometries.push(transformedGeometry)
        }
      }
    }
  }

  // Compute instance transformation matrices for hardware-accelerated instanced rendering
  const closeMatrices: THREE.Matrix4[] = []
  const farMatrices: THREE.Matrix4[] = []

  const matrix = new THREE.Matrix4()
  const position = new THREE.Vector3()
  const rotation = new THREE.Quaternion()
  const scaleVec = new THREE.Vector3()
  const euler = new THREE.Euler()

  for (const [x, z] of placements) {
    const sample = sampleIslandTerrain(terrain, x, z)
    const normalizedX = x / (terrain.width / 2)
    const normalizedZ = z / (terrain.depth / 2)
    const isFrontBeachZone = normalizedZ < -0.05 && Math.abs(normalizedX) < 0.78 && sample.height < 4.0

    if (
      !sample.land ||
      (kind === 'rock' && (sample.height < 0.95 || sample.height > 52.0 || isFrontBeachZone || isTerrainSand(terrain, x, z))) ||
      (kind === 'tree' && (isTerrainSand(terrain, x, z) || isTerrainRock(terrain, x, z)))
    ) {
      continue
    }

    const ix = Math.round(x * 10)
    const iz = Math.round(z * 10)

    if (kind === 'rock') {
      const slope = sampleTerrainSlope(terrain, x, z)
      const normal = sampleTerrainNormal(terrain, x, z)
      const isShore = sample.height <= 1.45

      // Balanced human/cart scale proportioned to roads (2m) and houses (3.5m)
      // Shore boulders: ~0.5m - 0.7m height; Mountain crags: ~0.8m - 1.1m height
      const closeMultiplier = isShore ? 18.0 : 25.0 + Math.min(7.0, (slope - 20.0) * 0.35)
      const scaleVariation = 0.85 + (hash2D(ix, iz, 1493) * 0.5 + 0.5) * 0.3
      const sClose = closeMultiplier * scaleVariation

      // When camera is higher up in overview, rocks appear smaller (~55% scale)
      // so the terrain and island silhouette stay clean and uncluttered from high altitude
      const sFar = sClose * 0.55

      if (slope >= 20.0) {
        const slopeAngle = (slope * Math.PI) / 180
        const yaw = Math.atan2(normal.nx, normal.nz) + hash2D(ix, iz, 8819) * 0.35
        const pitch = slopeAngle * 0.55
        const roll = hash2D(ix, iz, 7719) * 0.15
        euler.set(pitch, yaw, roll, 'YXZ')
        rotation.setFromEuler(euler)
      } else {
        const yaw = (hash2D(ix, iz, 8819) + 1) * Math.PI
        const tilt = hash2D(ix, iz, 5521) * 0.12
        euler.set(tilt, yaw, 0, 'YXZ')
        rotation.setFromEuler(euler)
      }

      // Close matrix
      scaleVec.set(sClose, sClose, sClose)
      const embedDepthClose = sClose * 0.003
      position.set(x, sample.height - embedDepthClose, z)
      matrix.compose(position, rotation, scaleVec)
      closeMatrices.push(matrix.clone())

      // Far matrix (smaller size when camera is higher up)
      scaleVec.set(sFar, sFar, sFar)
      const embedDepthFar = sFar * 0.003
      position.set(x, sample.height - embedDepthFar, z)
      matrix.compose(position, rotation, scaleVec)
      farMatrices.push(matrix.clone())
      continue
    } else {
      // Scots pine trees: naturally proportioned for 440m island terrain
      const isShoreline = sample.height <= 1.8
      const baseScale = isShoreline ? 0.48 : 0.58
      const scaleVariation = (hash2D(ix, iz, 3389) * 0.5 + 0.5) * (isShoreline ? 0.15 : 0.22)
      const s = baseScale + scaleVariation

      const yaw = (hash2D(ix, iz, 8819) + 1) * Math.PI
      const pitch = hash2D(ix, iz, 1029) * 0.04
      const roll = hash2D(ix, iz, 5521) * 0.04
      euler.set(pitch, yaw, roll, 'YXZ')
      rotation.setFromEuler(euler)

      // Embed base slightly so tree roots sit firmly in soil/rock
      position.set(x, sample.height - 0.06, z)
      scaleVec.set(s, s * (0.95 + (hash2D(ix, iz, 4423) * 0.5 + 0.5) * 0.1), s)
    }

    matrix.compose(position, rotation, scaleVec)
    closeMatrices.push(matrix.clone())
    farMatrices.push(matrix.clone())
  }

  if (closeMatrices.length === 0) return []

  const createdMeshes: THREE.InstancedMesh[] = []

  const buildMeshGroup = (
    groups: Map<THREE.Material, MaterialGroup>,
    name: string,
    castShadow: boolean,
    meshMatrices: THREE.Matrix4[] = closeMatrices,
  ) => {
    for (const group of groups.values()) {
      if (group.geometries.length === 0) continue
      let finalGeometry: THREE.BufferGeometry
      if (group.geometries.length === 1) {
        finalGeometry = group.geometries[0]
      } else {
        const merged = mergeGeometries(group.geometries, false)
        if (merged) {
          finalGeometry = merged
          group.geometries.forEach((g) => g.dispose())
        } else {
          finalGeometry = group.geometries[0]
        }
      }

      resources.add(finalGeometry)

      const instancedMesh = new THREE.InstancedMesh(finalGeometry, group.material, meshMatrices.length)
      instancedMesh.name = name
      for (let i = 0; i < meshMatrices.length; i++) {
        instancedMesh.setMatrixAt(i, meshMatrices[i])
      }

      instancedMesh.instanceMatrix.needsUpdate = true
      instancedMesh.matrixAutoUpdate = false
      instancedMesh.receiveShadow = true
      instancedMesh.castShadow = castShadow

      scene.add(instancedMesh)
      createdMeshes.push(instancedMesh)
    }
  }

  if (kind === 'rock') {
    // 1. PBR Rock Close-up: full 12,416-triangle photorealistic boulders when camera is near ground
    buildMeshGroup(closeTrunkGroups, 'PbrRock_Close', true, closeMatrices)

    // 2. Overview / Far mode: Simple brown dots on terrain as requested ("تبان نقطة بنية بس مش لازم صخور")
    // Replaces 3D rocks with 4-triangle brown specks (saving 99.9% GPU cost, 3.4k triangles total for all rocks)
    const dotGeometry = createBrownDotGeometry(0.55, 0.1)
    resources.add(dotGeometry)

    const dotMaterial = new THREE.MeshStandardMaterial({
      color: 0x7a695a, // warm brown rock speck matching Rock 09 diffuse
      roughness: 0.92,
      metalness: 0.04,
      flatShading: true,
    })
    resources.add(dotMaterial)

    const farMesh = new THREE.InstancedMesh(dotGeometry, dotMaterial, farMatrices.length)
    farMesh.name = 'PbrRock_Far'
    for (let i = 0; i < farMatrices.length; i++) {
      farMesh.setMatrixAt(i, farMatrices[i])
    }
    farMesh.instanceMatrix.needsUpdate = true
    farMesh.matrixAutoUpdate = false
    farMesh.receiveShadow = true
    farMesh.castShadow = false

    scene.add(farMesh)
    createdMeshes.push(farMesh)
  } else {
    // 1. Scots Pine Close-up (Trunk + dense needles)
    buildMeshGroup(closeTrunkGroups, 'PbrTree_Close_Trunk', true)
    buildMeshGroup(closeFoliageGroups, 'PbrTree_Close_Foliage', false)

    // 2. Scots Pine Far/Overview (Exact same Scots Pine model, lightweight trunk + overview needles)
    buildMeshGroup(farTrunkGroups, 'PbrTree_Far_Trunk', false)
    buildMeshGroup(farFoliageGroups, 'PbrTree_Far_Foliage', false)
  }

  return createdMeshes
}
