import * as THREE from 'three'
import { DECIDUOUS_MODEL_DATA } from './treeModelData'
import {
  hash2D,
  sampleIslandTerrain,
  sampleTerrainSlope,
  valueNoise2D,
  type IslandTerrain,
} from './terrain'

export type ForestPlacements = {
  shoreline: Array<[number, number]>
  woodland: Array<[number, number]>
}

/**
 * Creates tree buffer geometry from deciduous tree model vertex data with bark and foliage colors.
 */
export function createTreeGeometry(scale = 1.0): THREE.BufferGeometry {
  const modelData = DECIDUOUS_MODEL_DATA

  const geometry = new THREE.BufferGeometry()
  const positions = new Float32Array(modelData.positions.length)

  if (scale === 1.0) {
    positions.set(modelData.positions)
  } else {
    for (let i = 0; i < modelData.positions.length; i += 1) {
      positions[i] = modelData.positions[i] * scale
    }
  }

  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(modelData.normals), 3))
  geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(modelData.colors), 3))
  geometry.setIndex(new THREE.BufferAttribute(new Uint16Array(modelData.indices), 1))

  return geometry
}

/**
 * Creates cluster-based tree placements around specific coordinates on the island.
 */
export function createTreePlacements(terrain: IslandTerrain): Array<[number, number]> {
  const centers: Array<[number, number]> = [
    [-0.34, -0.18], [0.34, -0.18], [-0.38, 0.08], [0.38, 0.08],
    [-0.28, 0.14], [0.28, 0.14], [-0.1, 0.17], [0.1, 0.17],
  ]
  const placements: Array<[number, number]> = []
  centers.forEach(([centerX, centerZ], clusterIndex) => {
    for (let index = 0; index < 18; index += 1) {
      const angle = index * 2.399963229728653 + clusterIndex * 0.71
      const radius = 0.025 + (index % 6) * 0.017
      const x = (centerX + Math.cos(angle) * radius) * terrain.width / 2
      const z = (centerZ + Math.sin(angle) * radius) * terrain.depth / 2
      const sample = sampleIslandTerrain(terrain, x, z)
      if (sample.land && sample.height >= 1.5 && sample.height <= 14 && z < terrain.depth * 0.25 && !(Math.abs(x) < 13 && z < 22)) {
        placements.push([x, z])
      }
    }
  })
  return placements
}

/**
 * Determines forest distribution across the island, separating dense woodland from sparse shoreline trees.
 */
export function createForestPlacements(terrain: IslandTerrain): ForestPlacements {
  const shoreline: Array<[number, number]> = []
  const woodland: Array<[number, number]> = []

  const step = 1.7
  const halfW = terrain.width / 2 - 5
  const halfD = terrain.depth / 2 - 5

  for (let gz = -halfD; gz <= halfD; gz += step) {
    for (let gx = -halfW; gx <= halfW; gx += step) {
      const ix = Math.round(gx * 10)
      const iz = Math.round(gz * 10)
      const jx = hash2D(ix, iz, 14221) * (step * 0.42)
      const jz = hash2D(ix, iz, 82913) * (step * 0.42)
      const x = gx + jx
      const z = gz + jz

      const sample = sampleIslandTerrain(terrain, x, z)
      if (!sample.land || sample.height < 0.3 || sample.height > 16.5) {
        continue
      }

      const slope = sampleTerrainSlope(terrain, x, z)

      // Keep the original sparse shoreline spacing and density.
      if (sample.height <= 1.8 && slope < 18.0) {
        const shorelineHash = hash2D(ix, iz, 31103)
        if (shorelineHash > 0.68) shoreline.push([x, z])
        continue
      }

      const inTownClearing = Math.abs(x) < 13 && z > -10 && z < 20
      if (inTownClearing) continue

      // Woodland placements share one tree model across plains and foothills.
      if (sample.height >= 1.8 && slope < 30.0) {
        const forestClusterNoise = valueNoise2D(x * 0.045, z * 0.045, 12873)
        const densityHash = hash2D(ix, iz, 55219)
        if (forestClusterNoise > -0.25 && densityHash > -0.72) {
          woodland.push([x, z])

          // Increased forest density: add natural cluster companions in dense forest groves
          if (forestClusterNoise > 0.08) {
            const companionHash = hash2D(ix, iz, 38191)
            if (companionHash > -0.45) {
              const offsetX = hash2D(ix, iz, 11927) * (step * 0.38)
              const offsetZ = hash2D(ix, iz, 88231) * (step * 0.38)
              const cx = x + offsetX
              const cz = z + offsetZ
              const cSample = sampleIslandTerrain(terrain, cx, cz)
              const cSlope = sampleTerrainSlope(terrain, cx, cz)
              const cInClearing = Math.abs(cx) < 13 && cz > -10 && cz < 20
              if (
                !cInClearing &&
                cSample.land &&
                cSample.height > 1.8 &&
                cSample.height <= 16.5 &&
                cSlope <= 30.0
              ) {
                woodland.push([cx, cz])
              }
            }
          }
        }
      }
    }
  }

  return { shoreline, woodland }
}

/**
 * Adds instanced trees to the scene covering woodland and shoreline locations.
 */
export function addTrees(
  scene: THREE.Scene,
  terrain: IslandTerrain,
  resources: Set<THREE.Material | THREE.BufferGeometry | THREE.Texture>,
): THREE.InstancedMesh | undefined {
  const forest = createForestPlacements(terrain)
  const placements = [...forest.woodland, ...forest.shoreline]
  if (placements.length === 0) return undefined

  const matrix = new THREE.Matrix4()
  const position = new THREE.Vector3()
  const rotation = new THREE.Quaternion()
  const scaleVec = new THREE.Vector3()
  const euler = new THREE.Euler()

  const geometry = createTreeGeometry()
  resources.add(geometry)
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0.05 })
  resources.add(material)
  const instancedMesh = new THREE.InstancedMesh(geometry, material, placements.length)

  for (let i = 0; i < placements.length; i += 1) {
    const [x, z] = placements[i]
    const sample = sampleIslandTerrain(terrain, x, z)
    const ix = Math.round(x * 10)
    const iz = Math.round(z * 10)
    const isShoreline = sample.height <= 1.8
    const baseScale = isShoreline ? 2.4 : 2.2
    const scaleRange = isShoreline ? 0.6 : 0.7
    const s = baseScale + (hash2D(ix, iz, 3389) * 0.5 + 0.5) * scaleRange
    position.set(x, sample.height - 0.05, z)
    const yaw = (hash2D(ix, iz, 8819) + 1) * Math.PI
    const pitch = hash2D(ix, iz, 1029) * 0.06
    const roll = hash2D(ix, iz, 5521) * 0.06
    euler.set(pitch, yaw, roll, 'YXZ')
    rotation.setFromEuler(euler)
    scaleVec.set(s, s * (0.92 + (hash2D(ix, iz, 4423) * 0.5 + 0.5) * 0.18), s)
    matrix.compose(position, rotation, scaleVec)
    instancedMesh.setMatrixAt(i, matrix)
  }

  instancedMesh.instanceMatrix.needsUpdate = true
  instancedMesh.castShadow = true
  instancedMesh.receiveShadow = true
  scene.add(instancedMesh)

  return instancedMesh
}
