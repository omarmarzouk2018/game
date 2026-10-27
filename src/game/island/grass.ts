import * as THREE from 'three'
import {
  GRASS_MODEL_INDICES,
  GRASS_MODEL_NORMALS,
  GRASS_MODEL_POSITIONS,
} from './grassModelData'
import {
  hash2D,
  sampleIslandTerrain,
  sampleTerrainSlope,
  type IslandTerrain,
} from './terrain'

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
 * Calculates deterministic placement coordinates for grass patches on the island terrain.
 */
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

      const sample = sampleIslandTerrain(terrain, x, z)
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

/**
 * Instantiates grass meshes with custom vertex wind sway animation shaders into the scene.
 */
export function addGrass(
  scene: THREE.Scene,
  terrain: IslandTerrain,
  resources: Set<THREE.Material | THREE.BufferGeometry | THREE.Texture>,
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
    const sample = sampleIslandTerrain(terrain, x, z)
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
