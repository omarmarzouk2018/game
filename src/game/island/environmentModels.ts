import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { createRockPlacements } from './rocks'
import { createForestPlacements } from './trees'
import { hash2D, sampleIslandTerrain, type IslandTerrain } from './terrain'

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
): void {
  root.updateMatrixWorld(true)
  const meshes: THREE.Mesh[] = []
  root.traverse((child) => {
    if (child instanceof THREE.Mesh) meshes.push(child)
  })
  if (meshes.length === 0) return

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
  const groupsByMaterial = new Map<THREE.Material, MaterialGroup>()

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

    const isFoliage =
      mesh.name.toLowerCase().includes('needle') ||
      mesh.name.toLowerCase().includes('foliage') ||
      material.name?.toLowerCase().includes('foliage')

    let group = groupsByMaterial.get(material)
    if (!group) {
      group = { material, geometries: [], isFoliage }
      groupsByMaterial.set(material, group)
    }
    group.geometries.push(transformedGeometry)
  }

  // Compute instance transformation matrices
  const matrices: THREE.Matrix4[] = []
  const matrix = new THREE.Matrix4()
  const position = new THREE.Vector3()
  const rotation = new THREE.Quaternion()
  const scaleVec = new THREE.Vector3()
  const euler = new THREE.Euler()
  const upAxis = new THREE.Vector3(0, 1, 0)

  for (const [x, z] of placements) {
    const sample = sampleIslandTerrain(terrain, x, z)
    if (
      !sample.land ||
      (kind === 'rock' && (sample.height < 1.5 || sample.height > 14)) ||
      (kind === 'tree' && sample.height < 0.3)
    ) {
      continue
    }

    const ix = Math.round(x * 10)
    const iz = Math.round(z * 10)

    if (kind === 'rock') {
      const scale = 0.65 + ((Math.abs(x * 13 + z * 7) % 21) / 100)
      rotation.setFromAxisAngle(upAxis, (x - z) * 0.07)
      scaleVec.set(scale * 15, scale * 15, scale * 15)
      position.set(x, sample.height, z)
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

  if (matrices.length === 0) return

  // Build merged instanced mesh per material group
  for (const group of groupsByMaterial.values()) {
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
    for (let i = 0; i < matrices.length; i++) {
      instancedMesh.setMatrixAt(i, matrices[i])
    }

    instancedMesh.instanceMatrix.needsUpdate = true
    instancedMesh.matrixAutoUpdate = false
    instancedMesh.receiveShadow = true

    // Performance optimization: Trunks & branches cast solid shadows; dense needle sprays receive shadows
    instancedMesh.castShadow = kind === 'rock' || !group.isFoliage

    scene.add(instancedMesh)
  }
}
