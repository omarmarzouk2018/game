import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import pineUrl from '../../assets/environment/mature-scots-pine.glb?url'
import rockDocument from '../../assets/environment/rock-09/rock-09.gltf?raw'
import rockBufferUrl from '../../assets/environment/rock-09/rock_09.bin?url'
import rockNormalUrl from '../../assets/environment/rock-09/textures/rock_09_nor_gl_1k.jpg?url'
import rockDiffuseUrl from '../../assets/environment/rock-09/textures/rock_09_diff_1k.jpg?url'
import rockArmUrl from '../../assets/environment/rock-09/textures/rock_09_arm_1k.jpg?url'
import { createIslandTerrain, hash2D, sampleIslandTerrain, sampleTerrainSlope, valueNoise2D, type IslandTerrain } from './terrain'
import { createCameraController } from './CameraController'
import { createFrameRateMonitor, type FrameRateReading } from './FrameRateMonitor'
import {
  GRASS_MODEL_INDICES,
  GRASS_MODEL_NORMALS,
  GRASS_MODEL_POSITIONS,
} from './grassModelData'
import {
  ROCK_MODEL_VARIANTS,
  type RockModelVariant,
} from './rockModelData'
import {
  PINE_MODEL_DATA,
  DECIDUOUS_MODEL_DATA,
  PALM_MODEL_DATA,
  type TreeModelData,
} from './treeModelData'

export type IslandSceneHandle = {
  resize(): void
  dispose(): void
}

export type IslandSceneOptions = {
  onFrameRateUpdate?: (reading: FrameRateReading) => void
}

const terrainSeed = 41723
const oceanColor = 0x397c91
function terrainAt(terrain: IslandTerrain, x: number, z: number) {
  return sampleIslandTerrain(terrain, x, z)
}

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
      const sample = terrainAt(terrain, x, z)
      if (sample.land && sample.height >= 1.5 && sample.height <= 14 && z < terrain.depth * 0.25 && !(Math.abs(x) < 13 && z < 22)) placements.push([x, z])
    }
  })
  return placements
}

export function createRockGeometry(variant = 0, scale = 1.0): THREE.BufferGeometry {
  const modelData: RockModelVariant = ROCK_MODEL_VARIANTS[Math.abs(variant) % ROCK_MODEL_VARIANTS.length]
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
  geometry.setIndex(new THREE.BufferAttribute(new Uint16Array(modelData.indices), 1))

  return geometry
}

export function createRockPlacements(terrain: IslandTerrain): Array<[number, number]> {
  const placements: Array<[number, number]> = []
  const step = 2.4
  const halfW = terrain.width / 2 - 5
  const halfD = terrain.depth / 2 - 5

  for (let gz = -halfD; gz <= halfD; gz += step) {
    for (let gx = -halfW; gx <= halfW; gx += step) {
      const ix = Math.round(gx * 10)
      const iz = Math.round(gz * 10)
      const jx = hash2D(ix, iz, 10291) * (step * 0.42)
      const jz = hash2D(ix, iz, 88219) * (step * 0.42)
      const x = gx + jx
      const z = gz + jz

      const sample = terrainAt(terrain, x, z)
      if (!sample.land || sample.height <= 0.92) {
        continue
      }

      const slope = sampleTerrainSlope(terrain, x, z)
      const isShore = sample.height >= 0.95 && sample.height <= 1.45
      const isCliff = slope >= 20.0 && sample.height > 1.45 && sample.height <= 26.0

      if (isShore) {
        const shoreHash = hash2D(ix, iz, 33461)
        if (shoreHash > -0.6) {
          placements.push([x, z])
        }
      } else if (isCliff) {
        const cliffHash = hash2D(ix, iz, 66723)
        if (cliffHash > 0.15) {
          placements.push([x, z])
        }
      }
    }
  }

  return placements
}

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


export function createGrassPlacements(terrain: IslandTerrain): Array<[number, number]> {
  const placements: Array<[number, number]> = []
  const step = 2.0
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

      const sample = terrainAt(terrain, x, z)
      if (!sample.land || sample.height < 1.2 || sample.height > 10.0) {
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

function addGrass(
  scene: THREE.Scene,
  terrain: IslandTerrain,
  resources: Set<THREE.Material | THREE.BufferGeometry>,
): (time: number) => void {
  const placements = createGrassPlacements(terrain)
  if (placements.length === 0) return () => {}

  const geometry = createGrassGeometry()
  resources.add(geometry)

  const grassTimeUniform = { value: 0 }
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    side: THREE.DoubleSide,
    roughness: 0.85,
    metalness: 0.05,
    shadowSide: THREE.DoubleSide,
  })
  material.userData.grassTime = grassTimeUniform

  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = grassTimeUniform
    shader.vertexShader = `
      uniform float uTime;
      ${shader.vertexShader}
    `
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      `
      #include <begin_vertex>
      // Displace upper vertices of grass blades
      float swayWeight = smoothstep(0.0, 0.7, position.y);
      #ifdef USE_INSTANCING
        vec4 worldInstancePos = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        float windPhase = uTime * 2.6 + worldInstancePos.x * 0.22 + worldInstancePos.z * 0.18;
        float windSway = sin(windPhase) * 0.18 + sin(uTime * 4.2 + worldInstancePos.x * 0.45) * 0.06;
        transformed.x += windSway * swayWeight;
        transformed.z += (windSway * 0.6 + cos(windPhase * 0.7) * 0.08) * swayWeight;
      #else
        float windPhase = uTime * 2.6 + position.x * 0.22 + position.z * 0.18;
        transformed.x += sin(windPhase) * 0.18 * swayWeight;
      #endif
      `,
    )
  }
  resources.add(material)

  const instancedMesh = new THREE.InstancedMesh(geometry, material, placements.length)
  const matrix = new THREE.Matrix4()
  const position = new THREE.Vector3()
  const rotation = new THREE.Quaternion()
  const scale = new THREE.Vector3()
  const upAxis = new THREE.Vector3(0, 1, 0)

  for (let i = 0; i < placements.length; i += 1) {
    const [x, z] = placements[i]
    const sample = terrainAt(terrain, x, z)
    const ix = Math.round(x * 10)
    const iz = Math.round(z * 10)
    const yaw = (hash2D(ix, iz, 1337) + 1) * Math.PI
    const s = 0.85 + (hash2D(ix, iz, 9901) * 0.5 + 0.5) * 0.45

    position.set(x, sample.height, z)
    rotation.setFromAxisAngle(upAxis, yaw)
    scale.set(s, s, s)
    matrix.compose(position, rotation, scale)
    instancedMesh.setMatrixAt(i, matrix)
  }

  instancedMesh.instanceMatrix.needsUpdate = true
  instancedMesh.receiveShadow = true
  scene.add(instancedMesh)

  return (time: number) => {
    grassTimeUniform.value = time
  }
}

function addRocks(
  scene: THREE.Scene,
  terrain: IslandTerrain,
  resources: Set<THREE.Material | THREE.BufferGeometry>,
) {
  const placements = createRockPlacements(terrain)
  if (placements.length === 0) return

  const variantCount = ROCK_MODEL_VARIANTS.length
  const variantPlacements: Array<Array<[number, number]>> = Array.from({ length: variantCount }, () => [])
  for (let i = 0; i < placements.length; i += 1) {
    variantPlacements[i % variantCount].push(placements[i])
  }

  const rockPalette = [
    0x6e706c, // weathered granite slate
    0x7b7d76, // rocky cliff grey
    0x5e605d, // dark basalt
    0x757870, // crag limestone
  ]

  const matrix = new THREE.Matrix4()
  const position = new THREE.Vector3()
  const rotation = new THREE.Quaternion()
  const scaleVec = new THREE.Vector3()
  const euler = new THREE.Euler()

  for (let v = 0; v < variantCount; v += 1) {
    const instances = variantPlacements[v]
    if (instances.length === 0) continue

    const geometry = createRockGeometry(v)
    resources.add(geometry)

    const material = new THREE.MeshStandardMaterial({
      color: rockPalette[v % rockPalette.length],
      roughness: 0.88,
      metalness: 0.06,
      flatShading: true,
    })
    resources.add(material)

    const instancedMesh = new THREE.InstancedMesh(geometry, material, instances.length)

    for (let i = 0; i < instances.length; i += 1) {
      const [x, z] = instances[i]
      const sample = terrainAt(terrain, x, z)
      const ix = Math.round(x * 10)
      const iz = Math.round(z * 10)

      const isShore = sample.height <= 1.45
      const baseScale = isShore ? 1.4 : 2.5
      const s = baseScale * (0.8 + (hash2D(ix, iz, 1493) * 0.5 + 0.5) * 0.5)

      const embedOffset = 0.12 * s
      position.set(x, sample.height - embedOffset, z)

      const yaw = (hash2D(ix, iz, 8831) + 1) * Math.PI
      const pitch = hash2D(ix, iz, 5521) * 0.22
      const roll = hash2D(ix, iz, 7719) * 0.22
      euler.set(pitch, yaw, roll, 'YXZ')
      rotation.setFromEuler(euler)

      scaleVec.set(s, s * (0.85 + (hash2D(ix, iz, 4423) * 0.5 + 0.5) * 0.3), s)
      matrix.compose(position, rotation, scaleVec)
      instancedMesh.setMatrixAt(i, matrix)
    }

    instancedMesh.instanceMatrix.needsUpdate = true
    instancedMesh.castShadow = true
    instancedMesh.receiveShadow = true
    scene.add(instancedMesh)
  }
}

export function createTreeGeometry(
  type: 'pine' | 'deciduous' | 'palm',
  scale = 1.0,
): THREE.BufferGeometry {
  let modelData: TreeModelData
  if (type === 'pine') {
    modelData = PINE_MODEL_DATA
  } else if (type === 'deciduous') {
    modelData = DECIDUOUS_MODEL_DATA
  } else {
    modelData = PALM_MODEL_DATA
  }

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

export type ForestPlacements = {
  palms: Array<[number, number]>
  deciduous: Array<[number, number]>
  pines: Array<[number, number]>
}

export function createForestPlacements(terrain: IslandTerrain): ForestPlacements {
  const palms: Array<[number, number]> = []
  const deciduous: Array<[number, number]> = []
  const pines: Array<[number, number]> = []

  const step = 2.4
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

      const sample = terrainAt(terrain, x, z)
      if (!sample.land || sample.height < 0.3 || sample.height > 16.5) {
        continue
      }

      const slope = sampleTerrainSlope(terrain, x, z)

      // Palms: shoreline beach 0.3 <= height <= 1.8, gentle slope < 18°
      if (sample.height <= 1.8 && slope < 18.0) {
        const palmHash = hash2D(ix, iz, 31103)
        if (palmHash > -0.25) {
          palms.push([x, z])
        }
        continue
      }

      // Pines: mountain slopes and foothills 5.0 <= height <= 16.5, slope <= 30°
      if (sample.height >= 5.0 && slope <= 30.0) {
        if (sample.height > 8.0) {
          const pineHash = hash2D(ix, iz, 99173)
          if (pineHash > -0.45) {
            pines.push([x, z])
          }
          continue
        }

        // Between 5.0 and 8.0: transition zone between deciduous and pine
        const biomeNoise = valueNoise2D(x * 0.08, z * 0.08, 48211)
        if (biomeNoise > 0.0) {
          const pineHash = hash2D(ix, iz, 99173)
          if (pineHash > -0.35) {
            pines.push([x, z])
          }
          continue
        }
      }

      // Deciduous: temperate plains & interior 1.8 <= height <= 8.0
      if (sample.height >= 1.8 && sample.height <= 8.0 && slope < 22.0) {
        // Leave town / harbor clearing in central plain (buildable heart of island)
        const inTownClearing = Math.abs(x) < 13 && z > -10 && z < 20
        if (!inTownClearing) {
          const forestClusterNoise = valueNoise2D(x * 0.045, z * 0.045, 12873)
          const densityHash = hash2D(ix, iz, 55219)
          if (forestClusterNoise > -0.25 && densityHash > -0.4) {
            deciduous.push([x, z])
          }
        }
      }
    }
  }

  return { palms, deciduous, pines }
}

function addTrees(
  scene: THREE.Scene,
  terrain: IslandTerrain,
  resources: Set<THREE.Material | THREE.BufferGeometry>,
) {
  const forest = createForestPlacements(terrain)

  const treeConfigs: Array<{
    type: 'pine' | 'deciduous' | 'palm'
    placements: Array<[number, number]>
    baseScale: number
    scaleRange: number
    roughness: number
    metalness: number
    colorTint?: number
  }> = [
    {
      type: 'pine',
      placements: forest.pines,
      baseScale: 2.3,
      scaleRange: 0.6,
      roughness: 0.85,
      metalness: 0.05,
    },
    {
      type: 'deciduous',
      placements: forest.deciduous,
      baseScale: 2.2,
      scaleRange: 0.7,
      roughness: 0.82,
      metalness: 0.05,
    },
    {
      type: 'palm',
      placements: forest.palms,
      baseScale: 2.4,
      scaleRange: 0.6,
      roughness: 0.8,
      metalness: 0.05,
    },
  ]

  const matrix = new THREE.Matrix4()
  const position = new THREE.Vector3()
  const rotation = new THREE.Quaternion()
  const scaleVec = new THREE.Vector3()
  const euler = new THREE.Euler()

  for (const config of treeConfigs) {
    if (config.placements.length === 0) continue

    const geometry = createTreeGeometry(config.type)
    resources.add(geometry)

    const material = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: config.roughness,
      metalness: config.metalness,
    })
    resources.add(material)

    const instancedMesh = new THREE.InstancedMesh(geometry, material, config.placements.length)

    for (let i = 0; i < config.placements.length; i += 1) {
      const [x, z] = config.placements[i]
      const sample = terrainAt(terrain, x, z)
      const ix = Math.round(x * 10)
      const iz = Math.round(z * 10)

      const s = config.baseScale + (hash2D(ix, iz, 3389) * 0.5 + 0.5) * config.scaleRange
      position.set(x, sample.height - 0.05, z)

      const yaw = (hash2D(ix, iz, 8819) + 1) * Math.PI
      let pitch = 0
      let roll = 0

      if (config.type === 'palm') {
        // Subtle natural seaward lean for coastal palms
        const leanAngle = 0.12 + (hash2D(ix, iz, 9923) * 0.5 + 0.5) * 0.08
        pitch = Math.cos(yaw) * leanAngle
        roll = Math.sin(yaw) * leanAngle
      } else {
        // Slight slope alignment
        pitch = hash2D(ix, iz, 1029) * 0.06
        roll = hash2D(ix, iz, 5521) * 0.06
      }

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
  }
}

export function createTerrainGeometry(terrain: IslandTerrain): THREE.BufferGeometry {
  type TerrainVertex = { x: number; y: number; z: number; color: THREE.Color }
  const side = terrain.segments + 1
  const cellSize = terrain.width / terrain.segments
  const seabedLimit = -5.8
  const deepSeabed = new THREE.Color(0x26555b)
  const shallowSeabed = new THREE.Color(0x558f88)
  const beach = new THREE.Color(0xd4b886)
  const grass = new THREE.Color(0x4a7c34)
  const highland = new THREE.Color(0x5d7348)
  const rock = new THREE.Color(0x6b6e6b)
  const snow = new THREE.Color(0xc8d0d4)
  let peakHeight = 0
  for (let i = 0; i < terrain.heights.length; i += 1) {
    if (terrain.heights[i] > peakHeight) peakHeight = terrain.heights[i]
  }
  const snowStart = peakHeight * 0.72
  const snowFull = peakHeight * 0.92
  const vertices: TerrainVertex[] = []
  const indices: number[] = []
  const vertexIds = new Map<string, number>()
  const getTerrainVertex = (index: number): TerrainVertex => {
    const height = terrain.heights[index]
    const column = index % side
    const row = Math.floor(index / side)
    const left = terrain.heights[row * side + Math.max(0, column - 1)]
    const right = terrain.heights[row * side + Math.min(terrain.segments, column + 1)]
    const back = terrain.heights[Math.max(0, row - 1) * side + column]
    const front = terrain.heights[Math.min(terrain.segments, row + 1) * side + column]
    const dz_dx = (right - left) / (2 * cellSize)
    const dz_dz = (front - back) / (2 * cellSize)
    const slopeDeg = Math.atan(Math.hypot(dz_dx, dz_dz)) * (180 / Math.PI)

    let color: THREE.Color
    if (height < -2.0) {
      color = deepSeabed.clone().lerp(shallowSeabed, THREE.MathUtils.smoothstep(height, -5.8, -2.0))
    } else if (height < 0) {
      color = shallowSeabed.clone().lerp(beach, (height + 2.0) / 2.0)
    } else if (height < 1.2) {
      color = beach.clone().lerp(grass, height / 1.2)
    } else if (height < 6.0) {
      color = grass.clone().lerp(highland, (height - 1.2) / 4.8)
    } else if (height < 14.0) {
      color = highland.clone().lerp(rock, (height - 6.0) / 8.0)
    } else if (height < snowStart) {
      color = rock.clone()
    } else {
      color = rock.clone().lerp(snow, Math.min(1, (height - snowStart) / (snowFull - snowStart)))
    }

    if (slopeDeg > 25 && height > 0.5) {
      const cliffFactor = Math.min(0.92, (slopeDeg - 25) / 20)
      color.lerp(rock, cliffFactor)
    }
    return {
      x: ((index % side) / terrain.segments - 0.5) * terrain.width,
      y: height,
      z: (Math.floor(index / side) / terrain.segments - 0.5) * terrain.depth,
      color,
    }
  }
  const addVertex = (key: string, vertex: TerrainVertex) => {
    const existing = vertexIds.get(key)
    if (existing !== undefined) return existing
    const index = vertices.push(vertex) - 1
    vertexIds.set(key, index)
    return index
  }
  const intersection = (from: TerrainVertex, to: TerrainVertex, height: number): TerrainVertex => {
    const amount = (from.y - height) / (from.y - to.y)
    return {
      x: THREE.MathUtils.lerp(from.x, to.x, amount),
      y: height,
      z: THREE.MathUtils.lerp(from.z, to.z, amount),
      color: deepSeabed,
    }
  }
  const addClippedTriangle = (sourceIndices: number[]) => {
    const polygon: Array<{ vertex: TerrainVertex; key: string }> = []
    let previousIndex = sourceIndices[sourceIndices.length - 1]
    let previous = getTerrainVertex(previousIndex)
    let previousInside = previous.y >= seabedLimit
    for (const currentIndex of sourceIndices) {
      const current = getTerrainVertex(currentIndex)
      const currentInside = current.y >= seabedLimit
      if (currentInside !== previousInside) {
        const first = Math.min(previousIndex, currentIndex)
        const second = Math.max(previousIndex, currentIndex)
        const key = `edge:${first}:${second}`
        const point = intersection(previous, current, seabedLimit)
        polygon.push({ vertex: point, key })
      }
      if (currentInside) polygon.push({ vertex: current, key: `vertex:${currentIndex}` })
      previousIndex = currentIndex
      previous = current
      previousInside = currentInside
    }
    if (polygon.length < 3) return
    const first = addVertex(polygon[0].key, polygon[0].vertex)
    for (let index = 1; index < polygon.length - 1; index += 1) {
      indices.push(first, addVertex(polygon[index].key, polygon[index].vertex), addVertex(polygon[index + 1].key, polygon[index + 1].vertex))
    }
  }

  for (let row = 0; row < terrain.segments; row += 1) {
    for (let column = 0; column < terrain.segments; column += 1) {
      const a = row * side + column
      const b = a + 1
      const c = a + side
      const d = c + 1
      addClippedTriangle([a, c, b])
      addClippedTriangle([b, c, d])
    }
  }

  const positions = new Float32Array(vertices.length * 3)
  const colors = new Float32Array(vertices.length * 3)
  vertices.forEach((vertex, index) => {
    positions.set([vertex.x, vertex.y, vertex.z], index * 3)
    colors.set([vertex.color.r, vertex.color.g, vertex.color.b], index * 3)
  })
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}

function addOcean(
  scene: THREE.Scene,
  resources: Set<THREE.Material | THREE.BufferGeometry>,
): (time: number) => void {
  const geometry = new THREE.PlaneGeometry(800, 800, 96, 96)
  const material = new THREE.MeshStandardMaterial({ color: oceanColor, roughness: 0.32, metalness: 0.04 })
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uOceanTime = { value: 0 }
    shader.fragmentShader = `uniform float uOceanTime;\nvarying vec3 vOceanWorldPosition;\n${shader.fragmentShader}`
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <color_fragment>',
      `#include <color_fragment>
      float shore = 1.0 - smoothstep(105.0, 205.0, length(vOceanWorldPosition.xz));
      float distanceFromIsland = length(vOceanWorldPosition.xz);
      float horizonFog = smoothstep(245.0, 385.0, distanceFromIsland);
      float glint = pow(max(0.0, sin(vOceanWorldPosition.x * 0.11 + uOceanTime * 0.35) * sin(vOceanWorldPosition.z * 0.08 - uOceanTime * 0.22)), 18.0) * 0.035;
      vec3 waterColor = mix(vec3(0.025, 0.22, 0.30), vec3(0.12, 0.43, 0.48), shore);
      diffuseColor.rgb = mix(waterColor, vec3(0.72, 0.816, 0.824), horizonFog) + glint;`,
    )
    shader.vertexShader = `uniform float uOceanTime;\nvarying vec3 vOceanWorldPosition;\n${shader.vertexShader}`
    shader.vertexShader = shader.vertexShader.replace(
      '#include <worldpos_vertex>',
      '#include <worldpos_vertex>\nvOceanWorldPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;',
    )
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>\ntransformed.z += sin(position.x * 0.045 + uOceanTime * 0.35) * 0.012 + sin(position.y * 0.06 - uOceanTime * 0.22) * 0.008 + sin(position.x * 0.12 + position.y * 0.09 + uOceanTime * 0.18) * 0.004;`,
    )
    material.userData.oceanTime = shader.uniforms.uOceanTime
  }
  material.customProgramCacheKey = () => 'island-ocean-waves-v1'
  resources.add(geometry)
  resources.add(material)
  const ocean = new THREE.Mesh(geometry, material)
  ocean.rotation.x = -Math.PI / 2
  ocean.position.y = 0
  ocean.receiveShadow = true
  scene.add(ocean)
  return (time) => {
    const uniform = material.userData.oceanTime as { value: number } | undefined
    if (uniform) uniform.value = time
  }
}

export function createAnimalPlacements(terrain: IslandTerrain): Array<[number, number]> {
  const placements: Array<[number, number]> = []
  const centers: Array<[number, number]> = [[-18, 12], [22, -15], [-12, -22], [25, 20]]
  centers.forEach(([centerX, centerZ], idx) => {
    for (let i = 0; i < 3; i++) {
      const angle = i * 2.1 + idx
      const r = 4 + i * 2.5
      const x = centerX + Math.cos(angle) * r
      const z = centerZ + Math.sin(angle) * r
      const sample = terrainAt(terrain, x, z)
      if (sample.land && sample.height >= 2.0 && sample.height <= 12.0) {
        placements.push([x, z])
      }
    }
  })
  return placements
}

function addAnimals(
  scene: THREE.Scene,
  terrain: IslandTerrain,
  modelTemplate: THREE.Object3D,
): (time: number) => void {
  const placements = createAnimalPlacements(terrain)
  if (placements.length === 0) return () => {}
  const animals: THREE.Group[] = []
  placements.forEach(([x, z], index) => {
    const sample = terrainAt(terrain, x, z)
    const animal = modelTemplate.clone(true)
    animal.scale.set(0.12, 0.12, 0.12)
    animal.position.set(x, sample.height, z)
    animal.rotation.y = index * 1.57
    animal.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = true
        child.receiveShadow = true
      }
    })
    scene.add(animal)
    animals.push(animal)
  })
  return (time: number) => {
    animals.forEach((animal, i) => {
      const bob = Math.sin(time * 3.0 + i * 1.7) * 0.05
      animal.position.y += bob * 0.01
    })
  }
}

function addBirds(
  scene: THREE.Scene,
  modelTemplate: THREE.Object3D,
): (time: number) => void {
  const birdCount = 10
  const birds: THREE.Group[] = []
  for (let i = 0; i < birdCount; i++) {
    const bird = modelTemplate.clone(true)
    bird.scale.set(0.06, 0.06, 0.06)
    scene.add(bird)
    birds.push(bird)
  }
  return (time: number) => {
    birds.forEach((bird, i) => {
      const angle = time * 0.4 + i * (Math.PI * 2 / birdCount)
      const radius = 65 + Math.sin(time * 0.2 + i) * 15
      const x = Math.cos(angle) * radius
      const z = Math.sin(angle) * radius
      const y = 35 + Math.sin(time * 0.8 + i * 2) * 8
      bird.position.set(x, y, z)
      bird.rotation.y = -angle + Math.PI / 2
      bird.rotation.z = Math.sin(time * 12.0 + i * 1.5) * 0.15
    })
  }
}

function addShips(
  scene: THREE.Scene,
  modelTemplate: THREE.Object3D,
): (time: number) => void {
  const shipCount = 3
  const ships: THREE.Group[] = []
  for (let i = 0; i < shipCount; i++) {
    const ship = modelTemplate.clone(true)
    ship.scale.set(1.8, 1.8, 1.8)
    ship.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = true
        child.receiveShadow = true
      }
    })
    scene.add(ship)
    ships.push(ship)
  }
  return (time: number) => {
    ships.forEach((ship, i) => {
      const orbitSpeed = 0.12
      const angle = time * orbitSpeed + i * (Math.PI * 2 / shipCount)
      const radius = 130 + i * 35
      const x = Math.cos(angle) * radius
      const z = Math.sin(angle) * radius
      const y = Math.sin(time * 1.5 + i) * 0.6
      ship.position.set(x, y, z)
      ship.rotation.y = -angle + Math.PI / 2
      ship.rotation.z = Math.sin(time * 2.0 + i) * 0.05
      ship.rotation.x = Math.cos(time * 1.8 + i) * 0.04
    })
  }
}

export function rewriteRockDocument(jsonDocument: string): string {
  const absoluteUrl = (url: string) => new URL(url, window.document.baseURI).href
  return jsonDocument
    .replace(/("uri"\s*:\s*)"textures\/rock_09_nor_gl_1k\.jpg"/g, (_match, prefix: string) => `${prefix}"${absoluteUrl(rockNormalUrl)}"`)
    .replace(/("uri"\s*:\s*)"textures\/rock_09_diff_1k\.jpg"/g, (_match, prefix: string) => `${prefix}"${absoluteUrl(rockDiffuseUrl)}"`)
    .replace(/("uri"\s*:\s*)"textures\/rock_09_arm_1k\.jpg"/g, (_match, prefix: string) => `${prefix}"${absoluteUrl(rockArmUrl)}"`)
    .replace(/("uri"\s*:\s*)"rock_09\.bin"/g, (_match, prefix: string) => `${prefix}"${absoluteUrl(rockBufferUrl)}"`)
}

function localRockDocumentUrl(): string {
  const document = rewriteRockDocument(rockDocument)
  return URL.createObjectURL(new Blob([document], { type: 'model/gltf+json' }))
}

function addInstances(
  scene: THREE.Scene,
  root: THREE.Object3D,
  terrain: IslandTerrain,
  resources: Set<THREE.Material | THREE.BufferGeometry>,
  kind: 'tree' | 'rock',
) {
  root.updateMatrixWorld(true)
  const meshes: THREE.Mesh[] = []
  root.traverse((child) => {
    if (child instanceof THREE.Mesh) meshes.push(child)
  })
  for (const mesh of meshes) {
    const material = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    for (const item of material) resources.add(item)
    resources.add(mesh.geometry)
    const matrices: THREE.Matrix4[] = []
    const placements = kind === 'tree' ? createTreePlacements(terrain) : createRockPlacements(terrain)
    for (const [x, z] of placements) {
      const sample = terrainAt(terrain, x, z)
      if (!sample.land || (kind === 'tree' && (sample.height < 1.5 || sample.height > 14)) || (kind === 'tree' && Math.abs(x) < 13 && z < 22)) continue
      const matrix = new THREE.Matrix4()
      const scale = 0.65 + ((Math.abs(x * 13 + z * 7) % 21) / 100)
      matrix.compose(
        new THREE.Vector3(x, sample.height, z),
        new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), (x - z) * 0.07),
        new THREE.Vector3(kind === 'rock' ? scale * 15 : scale, kind === 'rock' ? scale * 15 : scale, kind === 'rock' ? scale * 15 : scale),
      )
      matrix.multiply(mesh.matrixWorld)
      matrices.push(matrix)
    }
    if (!matrices.length) continue
    const instances = new THREE.InstancedMesh(mesh.geometry, mesh.material, matrices.length)
    matrices.forEach((matrix, index) => instances.setMatrixAt(index, matrix))
    instances.instanceMatrix.needsUpdate = true
    instances.castShadow = true
    instances.receiveShadow = true
    scene.add(instances)
  }
}

export async function createIslandScene(
  container: HTMLElement,
  onFatalError: (message: string) => void,
  options: IslandSceneOptions = {},
): Promise<IslandSceneHandle> {
  const resources = new Set<THREE.Material | THREE.BufferGeometry>()
  let renderer: THREE.WebGLRenderer | undefined
  let animationFrame = 0
  let startTime: number | null = null
  let animateOcean: (time: number) => void = () => {}
  let animateGrass: (time: number) => void = () => {}
  let disposed = false
  let cameraController: ReturnType<typeof createCameraController> | undefined
  let previousFrameTime = 0
  let lastFrameRateNotification = 0
  let lastFrameRateState: FrameRateReading['state'] = 'measuring'
  const frameRateMonitor = createFrameRateMonitor()
  const noop: IslandSceneHandle = { resize() {}, dispose() {} }
  try {
    const terrain = createIslandTerrain(terrainSeed)
    if (terrain.heights.length !== (terrain.segments + 1) ** 2 || terrain.landMask.length !== terrain.heights.length) {
      throw new Error('بيانات التضاريس غير مكتملة')
    }
    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0xb8d0d2)
    scene.fog = new THREE.Fog(0xb8d0d2, 400, 1400)
    const camera = new THREE.PerspectiveCamera(42, Math.max(1, container.clientWidth) / Math.max(1, container.clientHeight), 0.1, 2400)
    const islandCenter = new THREE.Vector3(0, 1.6, 0)
    const initialTilt = 1.2
    const initialAzimuth = Math.atan2(112, -135)
    const maximumHeight = terrain.heights.reduce((maximum, height) => Math.max(maximum, height), 0)
    const terrainHalfWidth = terrain.width / 2
    const terrainHalfDepth = terrain.depth / 2
    const viewRadius = Math.hypot(terrainHalfWidth, maximumHeight - islandCenter.y, terrainHalfDepth)
    const getFitDistance = (aspect: number) => {
      const verticalHalfFov = THREE.MathUtils.degToRad(camera.fov / 2)
      const horizontalHalfFov = Math.atan(Math.tan(verticalHalfFov) * aspect)
      return viewRadius / Math.sin(Math.min(verticalHalfFov, horizontalHalfFov))
    }
    const fitDistance = getFitDistance(camera.aspect)
    const fog = scene.fog as THREE.Fog
    const updateFogForFitDistance = (distance: number) => {
      fog.near = Math.max(360, distance * 1.12)
      fog.far = Math.max(1500, distance * 3.2)
    }
    updateFogForFitDistance(fitDistance)
    camera.userData.islandFitDistance = fitDistance
    camera.userData.islandCameraTarget = islandCenter.clone()
    const initialDistance = fitDistance
    camera.position.set(
      islandCenter.x + Math.sin(initialAzimuth) * Math.sin(initialTilt) * initialDistance,
      islandCenter.y + Math.cos(initialTilt) * initialDistance,
      islandCenter.z + Math.cos(initialAzimuth) * Math.sin(initialTilt) * initialDistance,
    )
    camera.lookAt(islandCenter)
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    renderer.domElement.style.width = '100%'
    renderer.domElement.style.height = '100%'
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 0.96
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFShadowMap
    renderer.shadowMap.autoUpdate = false
    renderer.shadowMap.needsUpdate = true
    container.appendChild(renderer.domElement)

    const hemisphere = new THREE.HemisphereLight(0xdbe9e5, 0x665b45, 1.25)
    scene.add(hemisphere)
    const sunlight = new THREE.DirectionalLight(0xffe0b2, 2.15)
    sunlight.position.set(-55, 85, -35)
    sunlight.castShadow = true
    sunlight.shadow.mapSize.set(2048, 2048)
    sunlight.shadow.camera.left = -75
    sunlight.shadow.camera.right = 75
    sunlight.shadow.camera.top = 75
    sunlight.shadow.camera.bottom = -75
    sunlight.shadow.bias = -0.0002
    scene.add(sunlight)
    const fill = new THREE.AmbientLight(0xc1d8d9, 0.22)
    scene.add(fill)

    const terrainGeometry = createTerrainGeometry(terrain)
    const terrainMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0.05 })
    resources.add(terrainGeometry)
    resources.add(terrainMaterial)
    const terrainMesh = new THREE.Mesh(terrainGeometry, terrainMaterial)
    terrainMesh.receiveShadow = true
    terrainMesh.castShadow = true
    scene.add(terrainMesh)
    animateOcean = addOcean(scene, resources)
    animateGrass = addGrass(scene, terrain, resources)
    addRocks(scene, terrain, resources)
    addTrees(scene, terrain, resources)
    let animateAnimals: (time: number) => void = () => {}
    let animateBirds: (time: number) => void = () => {}
    let animateShips: (time: number) => void = () => {}

    const loader = new GLTFLoader()
    const rockUrl = localRockDocumentUrl()
    const models = [
      { url: pineUrl, label: 'Scots pine', kind: 'tree' as const },
      { url: rockUrl, label: 'rock', kind: 'rock' as const },
    ]
    let rockUrlRevoked = false
    const revokeRockUrl = () => {
      if (rockUrlRevoked) return
      rockUrlRevoked = true
      URL.revokeObjectURL(rockUrl)
    }
    void Promise.all(models.map(async ({ url, label, kind }) => {
      try {
        const { scene: model } = await loader.loadAsync(url)
        if (disposed) {
          model.traverse((child) => {
            if (child instanceof THREE.Mesh) {
              child.geometry.dispose()
              const materials = Array.isArray(child.material) ? child.material : [child.material]
              materials.forEach((material) => {
                material.dispose()
                for (const value of Object.values(material)) {
                  if (value instanceof THREE.Texture) value.dispose()
                }
              })
            }
          })
          return
        }
        addInstances(scene, model, terrain, resources, kind)
        if (kind === 'tree') {
          animateAnimals = addAnimals(scene, terrain, model)
          animateBirds = addBirds(scene, model)
        }
        if (kind === 'rock') {
          animateShips = addShips(scene, model)
        }
        if (renderer) renderer.shadowMap.needsUpdate = true
      } catch (error) {
        console.warn(`Optional environment ${label} model failed to load; terrain will remain available.`, error)
      } finally {
        if (url === rockUrl) revokeRockUrl()
      }
    }))

    const resize = () => {
      if (!renderer || disposed) return
      const width = Math.max(1, container.clientWidth)
      const height = Math.max(1, container.clientHeight)
      camera.aspect = width / height
      camera.updateProjectionMatrix()
      const requiredFitDistance = getFitDistance(camera.aspect)
      updateFogForFitDistance(requiredFitDistance)
      camera.userData.islandFitDistance = requiredFitDistance
      const currentTarget = camera.userData.islandCameraTarget as THREE.Vector3
      const currentDistance = camera.position.distanceTo(currentTarget)
      if (currentDistance < requiredFitDistance) {
        const viewDirection = camera.position.clone().sub(currentTarget).normalize()
        camera.position.copy(currentTarget).addScaledVector(viewDirection, requiredFitDistance)
        camera.lookAt(currentTarget)
        cameraController?.setDistance(requiredFitDistance)
      }
      renderer.setSize(width, height, false)
    }
    const publishFrameRate = (reading: FrameRateReading, time: number) => {
      if (!options.onFrameRateUpdate) return
      if (reading.state === lastFrameRateState && reading.state !== 'active') return
      if (reading.state === 'active' && time - lastFrameRateNotification < 500) return
      lastFrameRateState = reading.state
      lastFrameRateNotification = time
      options.onFrameRateUpdate(reading)
    }
    const onVisibilityChange = () => {
      frameRateMonitor.reset()
      const reading = frameRateMonitor.record(performance.now(), !document.hidden)
      publishFrameRate(reading, performance.now())
    }
    const render = (time: number) => {
      if (disposed || !renderer) return
      if (document.hidden) {
        frameRateMonitor.record(time, false)
        animationFrame = window.requestAnimationFrame(render)
        return
      }
      if (startTime === null) startTime = time
      const deltaSeconds = previousFrameTime === 0 ? 0 : (time - previousFrameTime) / 1000
      previousFrameTime = time
      cameraController?.update(deltaSeconds)
      updateFogForFitDistance(camera.position.distanceTo(islandCenter))
      animateOcean((time - startTime) / 1000)
      animateGrass((time - startTime) / 1000)
      animateAnimals((time - startTime) / 1000)
      animateBirds((time - startTime) / 1000)
      animateShips((time - startTime) / 1000)
      renderer.render(scene, camera)
      publishFrameRate(frameRateMonitor.record(time), time)
      animationFrame = window.requestAnimationFrame(render)
    }
    cameraController = createCameraController({
      camera,
      element: renderer.domElement,
      islandCenter,
      movementBounds: new THREE.Box2(new THREE.Vector2(-terrainHalfWidth, -terrainHalfDepth), new THREE.Vector2(terrainHalfWidth, terrainHalfDepth)),
      minDistance: 54,
      maxDistance: 700,
    })
    const dispose = () => {
      if (disposed) return
      disposed = true
      cameraController?.dispose()
      cameraController = undefined
      revokeRockUrl()
      window.cancelAnimationFrame(animationFrame)
      window.removeEventListener('resize', resize)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      options.onFrameRateUpdate?.({ state: 'paused', fps: null, frameTimeMs: null })
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          resources.add(object.geometry)
          const materials = Array.isArray(object.material) ? object.material : [object.material]
          materials.forEach((material) => {
            resources.add(material)
            for (const value of Object.values(material)) {
              if (value instanceof THREE.Texture) value.dispose()
            }
          })
        }
      })
      for (const resource of resources) resource.dispose()
      renderer?.dispose()
      renderer?.domElement.remove()
      renderer = undefined
    }
    window.addEventListener('resize', resize)
    document.addEventListener('visibilitychange', onVisibilityChange)
    resize()
    render(0)
    return { resize, dispose }
  } catch (error) {
    console.error('IslandScene error:', error)
    disposed = true
    window.cancelAnimationFrame(animationFrame)
    renderer?.dispose()
    renderer?.domElement.remove()
    for (const resource of resources) resource.dispose()
    const detail = error instanceof Error ? error.message : String(error)
    onFatalError(`تعذّر تحميل مشهد الجزيرة. يرجى تحديث الصفحة أو المحاولة مرة أخرى. (${detail})`)
    return noop
  }
}
