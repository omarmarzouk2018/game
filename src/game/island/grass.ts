import * as THREE from 'three'
import {
  GRASS_MODEL_INDICES,
  GRASS_MODEL_NORMALS,
  GRASS_MODEL_POSITIONS,
} from './grassModelData'
import {
  BiomeType,
  hash2D,
  sampleIslandTerrain,
  sampleTerrainBiome,
  sampleTerrainSlope,
  type IslandTerrain,
} from './terrain'
import { RoadNetwork } from '../roads/RoadNetwork'
import { type BuildingManager } from '../buildings/BuildingManager'

/**
 * Creates grass blade geometry with vertex colors transitioning from root to tip.
 */
export function createGrassGeometry(scale = 1.0): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry()
  const vertexCount = GRASS_MODEL_POSITIONS.length / 3
  const positions = new Float32Array(GRASS_MODEL_POSITIONS.length)
  const normals = new Float32Array(GRASS_MODEL_NORMALS.length)
  const colors = new Float32Array(GRASS_MODEL_POSITIONS.length)

  const rootColor = new THREE.Color(0x234d16)
  const tipColor = new THREE.Color(0x76b22c)
  const vertexColor = new THREE.Color()

  for (let i = 0; i < vertexCount; i += 1) {
    const i3 = i * 3
    const x = GRASS_MODEL_POSITIONS[i3] * scale
    const y = GRASS_MODEL_POSITIONS[i3 + 1] * scale
    const z = GRASS_MODEL_POSITIONS[i3 + 2] * scale

    positions[i3] = x
    positions[i3 + 1] = y
    positions[i3 + 2] = z

    normals[i3] = GRASS_MODEL_NORMALS[i3]
    normals[i3 + 1] = GRASS_MODEL_NORMALS[i3 + 1]
    normals[i3 + 2] = GRASS_MODEL_NORMALS[i3 + 2]

    const heightFactor = Math.max(0, Math.min(1, (y + 0.015) / (0.75 * scale)))
    vertexColor.copy(rootColor).lerp(tipColor, heightFactor)

    colors[i3] = vertexColor.r
    colors[i3 + 1] = vertexColor.g
    colors[i3 + 2] = vertexColor.b
  }

  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3))
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  geometry.setIndex(new THREE.BufferAttribute(new Uint16Array(GRASS_MODEL_INDICES), 1))

  return geometry
}

/**
 * Creates an ultra-lightweight single line/blade geometry (2 triangles) for distant overview rendering.
 * Slashes triangle count by 99% while depicting a clean, simple grass stroke on the terrain.
 */
export function createSimpleGrassLineGeometry(scale = 1.0): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry()
  const halfWidth = 0.045 * scale
  const height = 0.5 * scale

  // 4 vertices forming a simple vertical line blade
  const positions = new Float32Array([
    -halfWidth, 0, 0,
     halfWidth, 0, 0,
     halfWidth, height, 0,
    -halfWidth, height, 0,
  ])

  const normals = new Float32Array([
    0, 0, 1,
    0, 0, 1,
    0, 0, 1,
    0, 0, 1,
  ])

  const rootColor = new THREE.Color(0x234d16)
  const tipColor = new THREE.Color(0x76b22c)
  const colors = new Float32Array([
    rootColor.r, rootColor.g, rootColor.b,
    rootColor.r, rootColor.g, rootColor.b,
    tipColor.r, tipColor.g, tipColor.b,
    tipColor.r, tipColor.g, tipColor.b,
  ])

  const indices = new Uint16Array([
    0, 1, 2,
    0, 2, 3,
  ])

  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3))
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  geometry.setIndex(new THREE.BufferAttribute(indices, 1))

  return geometry
}

/**
 * Calculates deterministic placement coordinates for grass patches on the island terrain.
 */
export function createGrassPlacements(terrain: IslandTerrain): Array<[number, number]> {
  const placements: Array<[number, number]> = []
  const step = 3.6
  const halfW = terrain.width / 2 - 4
  const halfD = terrain.depth / 2 - 4

  for (let gz = -halfD; gz <= halfD; gz += step) {
    for (let gx = -halfW; gx <= halfW; gx += step) {
      const ix = Math.round(gx * 10)
      const iz = Math.round(gz * 10)
      const jx = hash2D(ix, iz, 41723) * (step * 0.45)
      const jz = hash2D(ix, iz, 98231) * (step * 0.45)
      const x = gx + jx
      const z = gz + jz

      const sample = sampleIslandTerrain(terrain, x, z)
      if (!sample.land || sample.height < 1.2 || sample.height > 10.0) continue

      const biome = sampleTerrainBiome(terrain, x, z)
      // Grass strictly grows only on fertile grass and forest margins; NEVER on sand, rock, snow, or water
      if (biome !== BiomeType.FERTILE_GRASS && biome !== BiomeType.FOREST_SOIL) {
        continue
      }

      const slope = sampleTerrainSlope(terrain, x, z)
      if (slope >= 18.0) {
        continue
      }

      // Density pattern: subtle natural clumping and clearing
      const densityHash = hash2D(ix, iz, 71291)
      if (densityHash < -0.38) {
        continue
      }

      placements.push([x, z])
    }
  }

  return placements
}

/**
 * Instantiates grass meshes with custom vertex wind sway animation shaders into the scene.
 * Automatically clears grass patches that lie on roads to prevent blades poking through.
 */
export function addGrass(
  scene: THREE.Scene,
  terrain: IslandTerrain,
  resources: Set<THREE.Material | THREE.BufferGeometry | THREE.Texture>,
  roadNetwork?: RoadNetwork,
  buildingManager?: BuildingManager,
): (time: number) => void {
  const placements = createGrassPlacements(terrain)
  if (placements.length === 0) return () => {}

  const geometry = createGrassGeometry(1.4)
  resources.add(geometry)

  // Simple line stroke geometry for distant overview (slashes triangles by 99% to ~7.8k triangles)
  const farGeometry = createSimpleGrassLineGeometry(1.4)
  resources.add(farGeometry)

  const grassTimeUniform = { value: 0 }
  // Grass movement stopped as requested ("اوقف تحريك العشب"): clean static standard material
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    side: THREE.DoubleSide,
    roughness: 0.85,
    metalness: 0.05,
    shadowSide: THREE.DoubleSide,
  })
  material.userData.grassTime = grassTimeUniform
  resources.add(material)

  const farMaterial = new THREE.MeshStandardMaterial({
    vertexColors: true,
    side: THREE.DoubleSide,
    roughness: 0.88,
    metalness: 0.02,
  })
  farMaterial.userData.grassFar = true
  resources.add(farMaterial)

  const instancedMesh = new THREE.InstancedMesh(geometry, material, placements.length)
  instancedMesh.name = 'Grass'
  instancedMesh.receiveShadow = true

  const farInstancedMesh = new THREE.InstancedMesh(farGeometry, farMaterial, placements.length)
  farInstancedMesh.name = 'Grass_Far'
  farInstancedMesh.receiveShadow = true
  farInstancedMesh.castShadow = true

  const matrix = new THREE.Matrix4()
  const position = new THREE.Vector3()
  const rotation = new THREE.Quaternion()
  const scale = new THREE.Vector3()
  const upAxis = new THREE.Vector3(0, 1, 0)

  const updateGrassInstances = () => {
    for (let i = 0; i < placements.length; i += 1) {
      const [x, z] = placements[i]
      const sample = sampleIslandTerrain(terrain, x, z)
      const ix = Math.round(x * 10)
      const iz = Math.round(z * 10)
      const yaw = (hash2D(ix, iz, 1337) + 1) * Math.PI
      const s = 0.85 + (hash2D(ix, iz, 9901) * 0.5 + 0.5) * 0.45

      const grid = RoadNetwork.worldToGrid(x, z)
      const isOnRoad = roadNetwork ? roadNetwork.hasTile(grid.gridX, grid.gridZ) : false
      const isOnBuilding = buildingManager ? buildingManager.isTileOccupied(grid.gridX, grid.gridZ) : false

      position.set(x, sample.height, z)
      rotation.setFromAxisAngle(upAxis, yaw)
      if (isOnRoad || isOnBuilding) {
        scale.set(0, 0, 0)
      } else {
        scale.set(s, s, s)
      }
      matrix.compose(position, rotation, scale)
      instancedMesh.setMatrixAt(i, matrix)
      farInstancedMesh.setMatrixAt(i, matrix)
    }
    instancedMesh.instanceMatrix.needsUpdate = true
    farInstancedMesh.instanceMatrix.needsUpdate = true
  }

  updateGrassInstances()

  if (roadNetwork) {
    const unsubscribeRoads = roadNetwork.subscribe(updateGrassInstances)
    // Add disposable token
    resources.add({
      dispose() {
        unsubscribeRoads()
      },
    } as unknown as THREE.Material)
  }

  if (buildingManager) {
    const unsubscribeBuildings = buildingManager.subscribe(updateGrassInstances)
    resources.add({
      dispose() {
        unsubscribeBuildings()
      },
    } as unknown as THREE.Material)
  }

  scene.add(instancedMesh)
  scene.add(farInstancedMesh)

  // Grass movement stopped as requested; track time uniform cleanly without vertex displacement
  const animateCallback = (time: number) => {
    grassTimeUniform.value = time
  }
  return Object.assign(animateCallback, { mesh: instancedMesh, farMesh: farInstancedMesh })
}
