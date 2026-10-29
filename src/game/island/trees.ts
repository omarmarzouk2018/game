import * as THREE from 'three'
import { DECIDUOUS_MODEL_DATA } from './treeModelData'
import {
  BiomeType,
  FOREST_CENTERS,
  hash2D,
  isTerrainRock,
  isTerrainSand,
  sampleIslandTerrain,
  sampleTerrainBiome,
  valueNoise2D,
  type IslandTerrain,
} from './terrain'

export { FOREST_CENTERS }

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
      if (
        sample.land &&
        !isTerrainSand(terrain, x, z) &&
        !isTerrainRock(terrain, x, z) &&
        z < terrain.depth * 0.25 &&
        !(Math.abs(x) < 13 && z < 22)
      ) {
        placements.push([x, z])
      }
    }
  })
  return placements
}



interface WoodlandCandidate {
  x: number
  z: number
  coreFactor: number
  minSpacing: number
  hash: number
}

/**
 * Determines forest distribution across the island, ensuring trees only grow on fertile soil.
 * Trees are strictly prohibited on sand (beaches/shores) and rock (steep cliffs, boulders, mountain peaks).
 * Places 3 forest centers on the outskirts/edges of the island.
 * Spacing between trees increases progressively from the grove centers outward to sparse peripheries.
 */
export function createForestPlacements(terrain: IslandTerrain): ForestPlacements {
  // Trees never spawn on sand (beaches/shores) or rock (cliffs/mountain crags)
  const shoreline: Array<[number, number]> = []
  const woodland: Array<[number, number]> = []

  const halfW = terrain.width / 2 - 5
  const halfD = terrain.depth / 2 - 5

  // Woodland trees: 3 Forest Centers on island outskirts with core-to-periphery spacing gradient
  // Center is tightly packed, while outskirts have wide distances between trees
  const candidates: WoodlandCandidate[] = []
  const woodlandStep = 2.0
  const minSpacingCenter = 2.35 // Tighter center spacing (meters)
  const maxSpacingEdge = 13.5 // Wider edge spacing (meters)

  for (let gz = -halfD; gz <= halfD; gz += woodlandStep) {
    for (let gx = -halfW; gx <= halfW; gx += woodlandStep) {
      const ix = Math.round(gx * 10)
      const iz = Math.round(gz * 10)
      const jx = hash2D(ix, iz, 14221) * (woodlandStep * 0.32)
      const jz = hash2D(ix, iz, 82913) * (woodlandStep * 0.32)
      const x = gx + jx
      const z = gz + jz

      const sample = sampleIslandTerrain(terrain, x, z)
      if (!sample.land) continue

      const biome = sampleTerrainBiome(terrain, x, z)
      // Trees strictly grow only in designated forest soil; NEVER on sand beaches or rock cliffs
      if (biome !== BiomeType.FOREST_SOIL) {
        continue
      }

      // Preserve town clearing for building and exploration
      const inTownClearing = Math.abs(x) < 13 && z > -10 && z < 20
      if (inTownClearing) continue

      // Calculate proximity to the nearest of the 3 edge forest centers
      let bestCoreFactor = 0

      for (let k = 0; k < FOREST_CENTERS.length; k += 1) {
        const center = FOREST_CENTERS[k]
        const dx = x - center.x
        const dz = z - center.z
        const dist = Math.hypot(dx, dz)

        // Organic edge variation so forest borders are natural rather than perfect geometric circles
        const borderNoise = valueNoise2D(x * 0.05, z * 0.05, 12873 + k * 1000) * 0.25
        const effectiveRadius = center.radius * (1.0 + borderNoise)

        if (dist < effectiveRadius) {
          const factor = 1.0 - dist / effectiveRadius
          if (factor > bestCoreFactor) {
            bestCoreFactor = factor
          }
        }
      }

      if (bestCoreFactor <= 0.02) continue

      // Non-linear falloff: Keeps the core thicket dense, and dramatically widens spacing towards periphery
      const densityCurve = Math.pow(bestCoreFactor, 0.85)
      const minSpacing = maxSpacingEdge - densityCurve * (maxSpacingEdge - minSpacingCenter)
      const h = hash2D(ix, iz, 55219)

      candidates.push({ x, z, coreFactor: bestCoreFactor, minSpacing, hash: h })
    }
  }

  // Sort candidates so forest centers are established first, then intermediate and perimeter zones
  candidates.sort((a, b) => b.coreFactor - a.coreFactor || b.hash - a.hash)

  // Spatial partitioning grid to guarantee distance requirements
  const spatialCellSize = 14
  const grid = new Map<string, Array<[number, number, number]>>()

  for (let i = 0; i < candidates.length; i += 1) {
    const c = candidates[i]
    const cx = Math.floor(c.x / spatialCellSize)
    const cz = Math.floor(c.z / spatialCellSize)
    const searchRadius = Math.ceil(c.minSpacing / spatialCellSize)

    let tooClose = false
    for (let ox = -searchRadius; ox <= searchRadius && !tooClose; ox += 1) {
      for (let oz = -searchRadius; oz <= searchRadius && !tooClose; oz += 1) {
        const cell = grid.get(`${cx + ox},${cz + oz}`)
        if (!cell) continue
        for (let j = 0; j < cell.length; j += 1) {
          const [ex, ez, eSpacing] = cell[j]
          const dx = c.x - ex
          const dz = c.z - ez
          const distSq = dx * dx + dz * dz
          const reqDist = Math.max(c.minSpacing, eSpacing * 0.85)
          if (distSq < reqDist * reqDist) {
            tooClose = true
            break
          }
        }
      }
    }

    if (!tooClose) {
      woodland.push([c.x, c.z])
      const cellKey = `${cx},${cz}`
      let cell = grid.get(cellKey)
      if (!cell) {
        cell = []
        grid.set(cellKey, cell)
      }
      cell.push([c.x, c.z, c.minSpacing])
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
  instancedMesh.name = 'Trees_Procedural'

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
