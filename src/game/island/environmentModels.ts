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
  const trunkGroupsByMaterial = new Map<THREE.Material, MaterialGroup>()
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

    // Optimization: Keep primary and secondary structural spreading crown limbs
    // preserving rich crown volume and supporting dense foliage clusters
    if (kind === 'tree' && meshName.includes('crown_limb')) {
      const match = meshName.match(/\d+$/)
      const limbIndex = match ? parseInt(match[0], 10) : 0
      if (limbIndex % 2 !== 0) {
        transformedGeometry.dispose()
        continue
      }
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

      // Overview/Far foliage: same Scots pine needle cards decimated (~670 cards, lightweight, matching crown silhouette)
      const farGeom = decimateFoliageQuads(transformedGeometry, 72, 1.6)
      let farGroup = farFoliageGroups.get(material)
      if (!farGroup) {
        farGroup = { material, geometries: [], isFoliage: true }
        farFoliageGroups.set(material, farGroup)
      }
      farGroup.geometries.push(farGeom)

      transformedGeometry.dispose()
    } else {
      let trunkGroup = trunkGroupsByMaterial.get(material)
      if (!trunkGroup) {
        trunkGroup = { material, geometries: [], isFoliage: false }
        trunkGroupsByMaterial.set(material, trunkGroup)
      }
      trunkGroup.geometries.push(transformedGeometry)
    }
  }

  // Compute instance transformation matrices for hardware-accelerated instanced rendering
  const matrices: THREE.Matrix4[] = []

  const matrix = new THREE.Matrix4()
  const position = new THREE.Vector3()
  const rotation = new THREE.Quaternion()
  const scaleVec = new THREE.Vector3()
  const euler = new THREE.Euler()
  const upAxis = new THREE.Vector3(0, 1, 0)

  for (const [x, z] of placements) {
    const sample = sampleIslandTerrain(terrain, x, z)
    const normalizedX = x / (terrain.width / 2)
    const normalizedZ = z / (terrain.depth / 2)
    const isFrontBeachZone = normalizedZ < -0.02 && Math.abs(normalizedX) < 0.68 && sample.height < 3.6

    if (
      !sample.land ||
      (kind === 'rock' && (sample.height < 1.45 || sample.height > 48.0 || isFrontBeachZone)) ||
      (kind === 'tree' && (isTerrainSand(terrain, x, z) || isTerrainRock(terrain, x, z)))
    ) {
      continue
    }

    const ix = Math.round(x * 10)
    const iz = Math.round(z * 10)

    if (kind === 'rock') {
      const slope = sampleTerrainSlope(terrain, x, z)
      const normal = sampleTerrainNormal(terrain, x, z)
      const scaleMultiplier = slope >= 20.0 ? 1.35 : 1.0
      const scale = (0.65 + ((Math.abs(x * 13 + z * 7) % 21) / 100)) * scaleMultiplier

      if (slope >= 20.0) {
        const slopeAngle = (slope * Math.PI) / 180
        const yaw = Math.atan2(normal.nx, normal.nz) + hash2D(ix, iz, 8819) * 0.3
        const pitch = slopeAngle * 0.55
        euler.set(pitch, yaw, 0, 'YXZ')
        rotation.setFromEuler(euler)
      } else {
        rotation.setFromAxisAngle(upAxis, (x - z) * 0.07)
      }
      scaleVec.set(scale * 15, scale * 15, scale * 15)
      position.set(x, sample.height - (slope >= 20.0 ? 0.35 : 0), z)
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
    matrices.push(matrix.clone())
  }

  if (matrices.length === 0) return []

  const createdMeshes: THREE.InstancedMesh[] = []

  const buildMeshGroup = (
    groups: Map<THREE.Material, MaterialGroup>,
    name: string,
    castShadow: boolean,
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

      const instancedMesh = new THREE.InstancedMesh(finalGeometry, group.material, matrices.length)
      instancedMesh.name = name
      for (let i = 0; i < matrices.length; i++) {
        instancedMesh.setMatrixAt(i, matrices[i])
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
    // PBR Rock 09: solid boulders on cliffs and shore
    buildMeshGroup(trunkGroupsByMaterial, 'PbrRock', true)
  } else {
    // 1. Scots Pine Trunk and Limbs (Always visible across all distances, never changed)
    buildMeshGroup(trunkGroupsByMaterial, 'PbrTree_Trunk', true)

    // 2. Scots Pine Close-up Foliage (~2,700 needle cards per tree, rich high-density)
    buildMeshGroup(closeFoliageGroups, 'PbrTree_Close_Foliage', false)

    // 3. Scots Pine Far/Overview Foliage (Same Scots Pine model, ~670 needle cards, matching crown silhouette)
    buildMeshGroup(farFoliageGroups, 'PbrTree_Far_Foliage', false)
  }

  return createdMeshes
}
